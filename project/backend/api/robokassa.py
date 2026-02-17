import base64
import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Any

import requests

from .models import Payment

logger = logging.getLogger(__name__)

ROBOKASSA_MERCHANT_LOGIN = "Routr"
ROBOKASSA_PASSWORD1 = "pCXNSJ44BX6UdOUk65Xj"
ROBOKASSA_PASSWORD2 = "TFA05xA1thUG9mCEw3xd"
ROBOKASSA_IS_TEST = True
ROBOKASSA_API_BASE = "https://auth.robokassa.ru/Merchant/InvoiceServiceWebApi"


class RobokassaError(Exception):
    def __init__(
        self,
        message: str,
        *,
        stage: str | None = None,
        status_code: int | None = None,
        response_snippet: str | None = None,
    ):
        super().__init__(message)
        self.stage = stage
        self.status_code = status_code
        self.response_snippet = response_snippet


def format_out_sum(value: Decimal) -> str:
    quantized = value.quantize(Decimal("0.01"))
    return f"{quantized:.2f}"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _build_jwt(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url(json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    encoded_payload = _b64url(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    key = f"{ROBOKASSA_MERCHANT_LOGIN}:{ROBOKASSA_PASSWORD1}".encode("utf-8")
    signature = hmac.new(key, signing_input, hashlib.sha256).digest()
    encoded_signature = _b64url(signature)
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"


def create_invoice_link_with_meta(payment: Payment) -> tuple[str, dict[str, Any]]:
    if not ROBOKASSA_MERCHANT_LOGIN or not ROBOKASSA_PASSWORD1:
        raise RobokassaError("Robokassa credentials are not configured", stage="config")

    payload = {
        "MerchantLogin": "Routr",
        "InvoiceType": "OneTime",
        "OutSum": "500.00"
    }
    token = _build_jwt(payload)
    print(token)
    endpoint = "https://services.robokassa.ru/InvoiceServiceWebApi/api/CreateInvoice"


    try:
        response = requests.post(
            endpoint,
            data=json.dumps(token),
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        response.raise_for_status()
        print(response.json())
    except requests.RequestException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        body = getattr(getattr(exc, "response", None), "text", "")
        logger.exception(
            "Robokassa CreateInvoice request failed: payment_id=%s invoice_id=%s status=%s body=%s",
            payment.id,
            payment.invoice_id,
            status_code,
            (body or "")[:1000],
        )
        raise RobokassaError(
            f"Failed to create Robokassa invoice: {exc}",
            stage="invoice_api_request",
            status_code=status_code,
            response_snippet=(body or "")[:1000] or None,
        ) from exc

    raw_body = response.text or ""
    try:
        data = response.json()
    except ValueError as exc:
        logger.exception(
            "Robokassa CreateInvoice non-JSON response: payment_id=%s invoice_id=%s body=%s",
            payment.id,
            payment.invoice_id,
            raw_body[:1000],
        )
        raise RobokassaError(
            "Failed to decode Robokassa response JSON",
            stage="invoice_api_parse",
            status_code=response.status_code,
            response_snippet=raw_body[:1000] or None,
        ) from exc

    if isinstance(data, dict) and data.get("isSuccess") is False:
        message = data.get("message") or "Invoice API rejected request"
        logger.warning(
            "Robokassa CreateInvoice rejected: payment_id=%s invoice_id=%s message=%s response=%s",
            payment.id,
            payment.invoice_id,
            message,
            json.dumps(data, ensure_ascii=False)[:1000],
        )
        raise RobokassaError(
            f"Robokassa error: {message}",
            stage="invoice_api_business",
            status_code=response.status_code,
            response_snippet=json.dumps(data, ensure_ascii=False)[:1000],
        )

    payment_url = None
    if isinstance(data, dict):
        payment_url = (
            data.get("invoiceUrl")
            or data.get("InvoiceUrl")
            or data.get("paymentUrl")
            or data.get("PaymentUrl")
            or data.get("url")
            or data.get("Url")
        )
    elif isinstance(data, str) and data.startswith("http"):
        payment_url = data

    if not payment_url:
        raise RobokassaError(
            "Robokassa response does not contain payment URL",
            stage="invoice_api_no_url",
            status_code=response.status_code,
            response_snippet=raw_body[:1000] or None,
        )

    logger.info(
        "Robokassa CreateInvoice success: payment_id=%s invoice_id=%s payment_url=%s",
        payment.id,
        payment.invoice_id,
        payment_url,
    )
    return str(payment_url), {
        "source": "invoice_api",
        "warning": None,
        "invoice_api_status": response.status_code,
    }


def create_invoice_link(payment: Payment) -> str:
    url, _meta = create_invoice_link_with_meta(payment)
    return url


def verify_result_signature(post_data: dict[str, Any]) -> bool:
    out_sum = str(post_data.get("OutSum", ""))
    inv_id = str(post_data.get("InvId", ""))
    signature = str(post_data.get("SignatureValue", ""))
    if not out_sum or not inv_id or not signature:
        return False

    extra = {}
    for key, value in post_data.items():
        key_str = str(key)
        if key_str.lower().startswith("shp_"):
            extra[key_str] = str(value)

    parts = [out_sum, inv_id, ROBOKASSA_PASSWORD2]
    for key, value in sorted(extra.items(), key=lambda item: item[0].lower()):
        parts.append(f"{key}={value}")
    expected = hashlib.md5(":".join(parts).encode("utf-8")).hexdigest()
    is_valid = hmac.compare_digest(expected.lower(), signature.lower())
    logger.info(
        "Robokassa result signature check: inv_id=%s out_sum=%s valid=%s provided=%s expected=%s extra=%s",
        inv_id,
        out_sum,
        is_valid,
        signature,
        expected,
        extra,
    )
    return is_valid
