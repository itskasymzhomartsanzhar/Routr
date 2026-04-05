# Routr Nginx + SSL (routr.swifttest.ru)

## 1. Запустить контейнеры проекта

```bash
cd /var/www/Routr/project
docker compose up -d --build
docker compose ps
```

Ожидаемые порты:
- `frontend` -> `127.0.0.1:3100`
- `backend` -> `127.0.0.1:8100`

## 2. Установить Nginx + Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 3. Открыть порты в firewall (если включен UFW)

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

## 4. Подготовить challenge-директорию

```bash
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/certbot
```

## 5. Подключить временный HTTP-конфиг (для выпуска сертификата)

```bash
sudo cp /var/www/Routr/project/deploy/nginx/routr.swifttest.ru.http.conf /etc/nginx/sites-available/routr.swifttest.ru.conf
sudo ln -sf /etc/nginx/sites-available/routr.swifttest.ru.conf /etc/nginx/sites-enabled/routr.swifttest.ru.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 6. Получить SSL-сертификат

Замените `your-email@domain.com` на ваш email:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d routr.swifttest.ru --agree-tos --non-interactive -m your-email@domain.com
```

## 7. Подключить финальный HTTPS-конфиг

```bash
sudo cp /var/www/Routr/project/deploy/nginx/routr.swifttest.ru.conf /etc/nginx/sites-available/routr.swifttest.ru.conf
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 8. Проверка

```bash
curl -I https://routr.swifttest.ru/
curl -I https://routr.swifttest.ru/v1/api/bootstrap/
```

## 9. Автопродление сертификата

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```
