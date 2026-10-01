sudo -u postgres psql -c "CREATE USER momo WITH PASSWORD 'M0W0rd%5';"
sudo -u postgres psql -c "CREATE DATABASE payment_service OWNER momo;"