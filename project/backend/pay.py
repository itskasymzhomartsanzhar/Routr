import base64
import hashlib
import hmac
import json
import requests
from datetime import datetime

MERCHANT_LOGIN = "Routr"
PASSWORD1 = "pCXNSJ44BX6UdOUk65Xj"
API_URL = "https://services.robokassa.ru/InvoiceServiceWebApi/api/CreateInvoice"

OUT_SUM = 500.00
INV_ID = int(datetime.now().timestamp())

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def b64_std(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8").rstrip("=")

def generate_jwt() -> str:
    header = {"typ": "JWT", "alg": "MD5"}

    payload = {
        "MerchantLogin": MERCHANT_LOGIN,
        "InvoiceType": "OneTime",
        "Culture": "ru",
        "OutSum": OUT_SUM,
    }

    header_enc = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_enc = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{header_enc}.{payload_enc}".encode("utf-8")
    key = f"{MERCHANT_LOGIN}:{PASSWORD1}".encode("utf-8")

    sig = hmac.new(key, signing_input, hashlib.md5).digest()
    sig_enc = b64_std(sig)

    return f"{header_enc}.{payload_enc}.{sig_enc}"

def create_invoice():
    jwt_token = generate_jwt()

    r = requests.post(
        API_URL,
        headers={"Content-Type": "application/json"},
        json=jwt_token,
        timeout=20,
    )

    print("Status:", r.status_code)
    print("Response:", r.text)

    data = r.json()
    pay_url = data.get("url") or data.get("Url") or data.get("paymentUrl") or data.get("PaymentUrl")
    return data, pay_url

if __name__ == "__main__":
    data, pay_url = create_invoice()
    print("\nPayment URL:", pay_url)
