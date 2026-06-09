import hashlib
import hmac
import logging
import json
import re
from decimal import Decimal
from typing import Any
import html
import os
from urllib.parse import urlparse, parse_qsl, urlencode, quote

from django.conf import settings
from .models import Payment

logger = logging.getLogger(__name__)

ROBOKASSA_MERCHANT_LOGIN = "Routr"
ROBOKASSA_PASSWORD1 = "j6dmGI63ltn39CxMQNVv"
ROBOKASSA_PASSWORD2 = "OZCr57Lv2svKE4H3ReEB"
ROBOKASSA_IS_TEST = False
ROBOKASSA_WEBHOOK_BASE_URL = os.getenv("WEBAPP_URL", "").strip()

if ROBOKASSA_WEBHOOK_BASE_URL.endswith("/"):
    ROBOKASSA_WEBHOOK_BASE_URL = ROBOKASSA_WEBHOOK_BASE_URL[:-1]

ROBOKASSA_SUCCESS_URL = f"{ROBOKASSA_WEBHOOK_BASE_URL}/v1/api/payments/robokassa/success/" if ROBOKASSA_WEBHOOK_BASE_URL else ""
ROBOKASSA_FAIL_URL = f"{ROBOKASSA_WEBHOOK_BASE_URL}/v1/api/payments/robokassa/fail/" if ROBOKASSA_WEBHOOK_BASE_URL else ""
ROBOKASSA_RECEIPT_SNO = ""
ROBOKASSA_RECEIPT_TAX = "none"
ROBOKASSA_RECEIPT_PAYMENT_METHOD =  "full_payment"
ROBOKASSA_RECEIPT_PAYMENT_OBJECT = "service"


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
        merchant_login=ROBOKASSA_MERCHANT_LOGIN,
        password1=ROBOKASSA_PASSWORD1,
        password2=ROBOKASSA_PASSWORD2,
        is_test=ROBOKASSA_IS_TEST,
        algorithm=HashAlgorithm.md5,
    )


def _debug_signature_from_url(payment_url: str) -> None:
    parsed = urlparse(payment_url)
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    merchant = str(params.get("MerchantLogin", ""))
    out_sum = str(params.get("OutSum", ""))
    inv_id = str(params.get("InvId", ""))
    signature = str(params.get("SignatureValue", ""))
    if not merchant or not out_sum or not signature:
        return

    receipt = params.get("Receipt")
    if receipt:
        base = f"{merchant}:{out_sum}:{inv_id}:{receipt}:{ROBOKASSA_PASSWORD1}"
    else:
        base = f"{merchant}:{out_sum}:{inv_id}:{ROBOKASSA_PASSWORD1}"
    expected = hashlib.md5(base.encode("utf-8")).hexdigest()
    if expected.lower() != signature.lower():
        logger.error(
            "Robokassa URL signature mismatch before redirect: expected=%s provided=%s merchant=%s out_sum=%s inv_id=%s",
            expected,
            signature,
            merchant,
            out_sum,
            inv_id,
        )
    else:
        logger.info(
            "Robokassa URL signature validated locally: merchant=%s out_sum=%s inv_id=%s",
            merchant,
            out_sum,
            inv_id,
        )


def _normalize_out_sum_for_signature(value: Decimal) -> str:
    normalized = value.quantize(Decimal("0.01")).normalize()
    text = format(normalized, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _normalize_receipt_item_name(raw_name: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(raw_name or ""))
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        text = "Покупка в Routr"
    if len(text) > 128:
        text = text[:128].rstrip()
    return text


def _build_receipt_payload(payment: Payment) -> dict[str, Any]:
    amount = float(payment.amount.quantize(Decimal("0.01")))
    item = {
        "name": _normalize_receipt_item_name(payment.product.name if payment.product_id else ""),
        "quantity": 1,
        "sum": amount,
        "payment_method": ROBOKASSA_RECEIPT_PAYMENT_METHOD,
        "payment_object": ROBOKASSA_RECEIPT_PAYMENT_OBJECT,
        "tax": ROBOKASSA_RECEIPT_TAX,
    }
    receipt: dict[str, Any] = {"items": [item]}
    if ROBOKASSA_RECEIPT_SNO:
        receipt["sno"] = ROBOKASSA_RECEIPT_SNO
    return receipt


def _build_simple_payment_url(payment: Payment) -> str:
    out_sum = _normalize_out_sum_for_signature(payment.amount)
    inv_id = int(payment.invoice_id or payment.id or 0)
    receipt_payload = _build_receipt_payload(payment)
    receipt_json = json.dumps(receipt_payload, ensure_ascii=False, separators=(",", ":"))
    receipt_encoded = quote(receipt_json, safe="")
    signature_base = f"{ROBOKASSA_MERCHANT_LOGIN}:{out_sum}:{inv_id}:{receipt_encoded}:{ROBOKASSA_PASSWORD1}"
    signature_value = hashlib.md5(signature_base.encode("utf-8")).hexdigest()
    params = {
        "MerchantLogin": ROBOKASSA_MERCHANT_LOGIN,
        "OutSum": out_sum,
        "InvId": str(inv_id),
        "Receipt": receipt_encoded,
        "SignatureValue": signature_value,
        "Culture": "ru",
    }
    if ROBOKASSA_IS_TEST:
        params["IsTest"] = "1"
    logger.info(
        "Robokassa signature base prepared: payment_id=%s invoice_id=%s base=%s signature=%s receipt=%s",
        payment.id,
        inv_id,
        signature_base,
        signature_value,
        receipt_payload,
    )
    return f"https://auth.robokassa.ru/Merchant/Index.aspx?{urlencode(params)}"


def create_invoice_link_with_meta(payment: Payment) -> tuple[str, dict[str, Any]]:
    if not ROBOKASSA_MERCHANT_LOGIN or not ROBOKASSA_PASSWORD1 or not ROBOKASSA_PASSWORD2:
        raise RobokassaError("Robokassa credentials are not configured", stage="config")
    try:
        payment_url = _build_simple_payment_url(payment)
        payment_url = html.unescape(str(payment_url))
        _debug_signature_from_url(payment_url)
    except Exception as exc:
        logger.exception(
            "Robokassa payment link generation failed: payment_id=%s invoice_id=%s",
            payment.id,
            payment.invoice_id,
        )
        raise RobokassaError(
            f"Failed to generate Robokassa payment link: {exc}",
            stage="build_payment_link",
        ) from exc

    if not payment_url:
        raise RobokassaError(
            "Robokassa response does not contain payment URL",
            stage="sdk_no_url",
        )

    logger.info(
        "Robokassa payment link generated: payment_id=%s invoice_id=%s payment_url=%s",
        payment.id,
        payment.invoice_id,
        payment_url,
    )
    return str(payment_url), {
        "source": "redirect_link",
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
