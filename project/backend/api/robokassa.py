import hashlib
import hmac
import logging
from decimal import Decimal
from typing import Any
import html
import os
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

from .models import Payment

logger = logging.getLogger(__name__)

ROBOKASSA_MERCHANT_LOGIN = "Routr"
ROBOKASSA_PASSWORD1 = "pCXNSJ44BX6UdOUk65Xj"
ROBOKASSA_PASSWORD2 = "TFA05xA1thUG9mCEw3xd"
ROBOKASSA_IS_TEST = True
ROBOKASSA_API_BASE = "https://auth.robokassa.ru/Merchant/InvoiceServiceWebApi"
ROBOKASSA_RETURN_BOT_URL = "https://t.me/Routr_bot"
ROBOKASSA_WEBHOOK_BASE_URL = os.getenv("WEBAPP_URL", "").strip()

if ROBOKASSA_WEBHOOK_BASE_URL.endswith("/"):
    ROBOKASSA_WEBHOOK_BASE_URL = ROBOKASSA_WEBHOOK_BASE_URL[:-1]

ROBOKASSA_SUCCESS_URL = f"{ROBOKASSA_WEBHOOK_BASE_URL}/v1/api/payments/robokassa/success/" if ROBOKASSA_WEBHOOK_BASE_URL else ""
ROBOKASSA_FAIL_URL = f"{ROBOKASSA_WEBHOOK_BASE_URL}/v1/api/payments/robokassa/fail/" if ROBOKASSA_WEBHOOK_BASE_URL else ""


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


def _build_robokassa_client():
    try:
        from robokassa import HashAlgorithm, Robokassa
    except Exception as exc:
        raise RobokassaError(
            "Robokassa SDK is not installed (pip install robokassa)",
            stage="sdk_import",
        ) from exc

    return Robokassa(
        merchant_login="Routr",
        password1="pCXNSJ44BX6UdOUk65Xj",
        password2="TFA05xA1thUG9mCEw3xd",
        is_test=True,
        algorithm=HashAlgorithm.md5,
    )


def create_invoice_link_with_meta(payment: Payment) -> tuple[str, dict[str, Any]]:
    if not ROBOKASSA_MERCHANT_LOGIN or not ROBOKASSA_PASSWORD1 or not ROBOKASSA_PASSWORD2:
        raise RobokassaError("Robokassa credentials are not configured", stage="config")
    try:
        client = _build_robokassa_client()
        out_sum = payment.amount.quantize(Decimal("0.01"))
        payment_url = client.generate_open_payment_link(
            out_sum=out_sum,
            inv_id=int(payment.invoice_id),
        )
        if hasattr(payment_url, "url"):
            payment_url = getattr(payment_url, "url")
        payment_url = html.unescape(str(payment_url))
        if ROBOKASSA_SUCCESS_URL or ROBOKASSA_FAIL_URL or ROBOKASSA_RETURN_BOT_URL:
            parsed = urlparse(payment_url)
            params = dict(parse_qsl(parsed.query, keep_blank_values=True))
            if ROBOKASSA_SUCCESS_URL:
                params["SuccessURL"] = ROBOKASSA_SUCCESS_URL
                params["SuccessURLMethod"] = "GET"
            if ROBOKASSA_FAIL_URL:
                params["FailURL"] = ROBOKASSA_FAIL_URL
                params["FailURLMethod"] = "GET"
            if ROBOKASSA_RETURN_BOT_URL:
                params.setdefault("SuccessURL", ROBOKASSA_RETURN_BOT_URL)
                params.setdefault("FailURL", ROBOKASSA_RETURN_BOT_URL)
            new_query = urlencode(params, doseq=True)
            payment_url = urlunparse(parsed._replace(query=new_query))
    except RobokassaError:
        raise
    except Exception as exc:
        logger.exception(
            "Robokassa SDK link generation failed: payment_id=%s invoice_id=%s",
            payment.id,
            payment.invoice_id,
        )
        raise RobokassaError(
            f"Failed to generate Robokassa payment link: {exc}",
            stage="sdk_generate_link",
        ) from exc

    if not payment_url:
        raise RobokassaError(
            "Robokassa response does not contain payment URL",
            stage="sdk_no_url",
        )

    logger.info(
        "Robokassa SDK payment link generated: payment_id=%s invoice_id=%s payment_url=%s",
        payment.id,
        payment.invoice_id,
        payment_url,
    )
    return str(payment_url), {
        "source": "robokassa_sdk",
        "warning": None,
        "invoice_api_status": None,
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


def verify_success_signature(post_data: dict[str, Any]) -> bool:
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

    parts = [out_sum, inv_id, ROBOKASSA_PASSWORD1]
    for key, value in sorted(extra.items(), key=lambda item: item[0].lower()):
        parts.append(f"{key}={value}")
    expected = hashlib.md5(":".join(parts).encode("utf-8")).hexdigest()
    is_valid = hmac.compare_digest(expected.lower(), signature.lower())
    logger.info(
        "Robokassa success signature check: inv_id=%s out_sum=%s valid=%s provided=%s expected=%s extra=%s",
        inv_id,
        out_sum,
        is_valid,
        signature,
        expected,
        extra,
    )
    return is_valid
