#!/usr/bin/env bash
# Makes a private "hospital certificate authority" (CA) and a server certificate. FREE (OpenSSL).
# Usage: ./make-local-ca.sh goodie-medhub.local 192.168.1.50
set -euo pipefail
HOST="${1:?hostname, e.g. goodie-medhub.local}"; IP="${2:?server IP, e.g. 192.168.1.50}"
OUT="${3:-../tls}"; mkdir -p "$OUT"; cd "$OUT"
if [ ! -f hospital-ca.key ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out hospital-ca.key
  openssl req -x509 -new -key hospital-ca.key -sha256 -days 3650 -subj "/CN=GOODIE-MEDHUB Hospital CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -out hospital-ca.crt
fi
openssl ecparam -name prime256v1 -genkey -noout -out server.key
openssl req -new -key server.key -subj "/CN=$HOST" -out server.csr
printf "subjectAltName=DNS:%s,IP:%s\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature\nbasicConstraints=CA:FALSE\n" "$HOST" "$IP" > san.cnf
openssl x509 -req -in server.csr -CA hospital-ca.crt -CAkey hospital-ca.key -CAcreateserial -days 825 -sha256 -extfile san.cnf -out server.crt
rm -f server.csr san.cnf
echo "Done. Put server.key/server.crt in .env (TLS_KEY / TLS_CERT). Install hospital-ca.crt on each device ONCE."
echo "NEVER share hospital-ca.key."
