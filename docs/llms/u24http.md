# Ubuntu 24.04 — u24http (HTTP-шлюз)

Успешные шаги записываются сюда.

| Параметр | Значение |
|----------|----------|
| Hostname | **u24http** ✅ |
| CPU / RAM | **2** ядра, **2 GB** |
| SSD | **128G** (LVM, `/` ~123G) ✅ |
| LAN IP | **192.168.1.154** |
| Домен | **openfunai.duckdns.org** ✅ |
| Белый IP | **85.112.42.53** |
| WAN | **80, 443** → **192.168.1.154** ✅ |
| `/dirk/*` | **192.168.1.236:8080** (Dirk) ✅ |
| `/dirk-capture/*` | **192.168.1.236:8081** (Cursor capture proxy) |
| `/tiel/*` | **192.168.1.220:8080** (Tiel) ✅ |

---

## Подготовка VM ✅

Ubuntu 24.04, без GPU.

```bash
sudo apt update && sudo apt upgrade -y
sudo hostnamectl set-hostname u24http

sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
df -h /
```

Результат: `/` ~123G.

---

## UFW ✅

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status numbered
```

---

## DuckDNS ✅

Поддомен **openfunai** → **85.112.42.53** на [duckdns.org](https://www.duckdns.org).

---

## Роутер ✅

| WAN | LAN |
|-----|-----|
| **80** → 192.168.1.154:80 | |
| **443** → 192.168.1.154:443 | |

---

## Caddy + HTTPS ✅

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddy
openfunai.duckdns.org {

	handle /dirk/* {
		uri strip_prefix /dirk
		reverse_proxy 192.168.1.236:8080 {
			flush_interval -1
			transport http {
				read_timeout 600s
				write_timeout 600s
			}
		}
	}

	handle /dirk-capture/* {
		uri strip_prefix /dirk-capture
		reverse_proxy 192.168.1.236:8081 {
			flush_interval -1
			transport http {
				read_timeout 600s
				write_timeout 600s
			}
		}
	}

	handle /tiel/* {
		uri strip_prefix /tiel
		reverse_proxy 192.168.1.220:8080 {
			flush_interval -1
			transport http {
				read_timeout 600s
				write_timeout 600s
			}
		}
	}

	handle / {
		respond "u24http ok" 200
	}
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Проверка:

```bash
curl -s https://openfunai.duckdns.org/
curl -s https://openfunai.duckdns.org/dirk/health
curl -s https://openfunai.duckdns.org/dirk-capture/health
curl -s https://openfunai.duckdns.org/tiel/health

curl -s https://openfunai.duckdns.org/dirk/v1/models \
  -H "Authorization: Bearer $(cat /etc/llama/api.key)"

curl -s https://openfunai.duckdns.org/dirk-capture/v1/models \
  -H "Authorization: Bearer $(cat /etc/llama/api.key)"

curl -s https://openfunai.duckdns.org/tiel/v1/models \
  -H "Authorization: Bearer $(cat /etc/llama/api.key)"
```

Результат: `u24http ok`, `/dirk/health` и `/tiel/health` → `{"status":"ok"}`, Let's Encrypt ✅.  
`/dirk-capture/health` → `{"status":"capture-proxy-ok",...}` когда прокси запущен на 236.

**Cursor:**

```
Dirk:          https://openfunai.duckdns.org/dirk/v1
Dirk capture:  https://openfunai.duckdns.org/dirk-capture/v1   ← перехват запросов
Tiel:          https://openfunai.duckdns.org/tiel/v1
Key:           /etc/llama/api.key (на GPU-VM 220 и 236)
```

Capture — временно, пока исследуем что шлёт Cursor. Подробнее: [cursor-api-capture.md](../cursor/cursor-api-capture.md).

---

## UFW на GPU-VM (220, 236) ✅

`:8080` только с u24http. Caddy на GPU-VM удалён.  
Для capture на **236** дополнительно `:8081` только с u24http:

```bash
sudo ufw allow OpenSSH
sudo ufw delete allow 8080/tcp
sudo ufw allow from 192.168.1.154 to any port 8080 proto tcp
sudo ufw enable
sudo ufw status numbered
```

На **236** (пока идёт перехват):

```bash
sudo ufw allow from 192.168.1.154 to any port 8081 proto tcp comment 'cursor capture via u24http'
```

На GPU-VM ключ: **`/etc/llama/api.key`**, сервисы `dirk` / `tiel-coder`.

---
