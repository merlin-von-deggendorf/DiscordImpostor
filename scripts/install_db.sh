cd ~/DiscordImpostor

cat > scripts/install_db.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

########################################
# Configuration
########################################
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD="thisisa23423strongp3230"

########################################
# Checks
########################################
if [[ "$EUID" -ne 0 ]]; then
  echo "This script must be run as root (use sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

########################################
# Install MariaDB
########################################
apt-get update
apt-get install -y mariadb-server mariadb-client

systemctl enable mariadb
systemctl start mariadb

########################################
# Secure MariaDB and set root password (first run only)
########################################
# If we can connect as root WITHOUT a password via unix socket, we assume
# this is the first-time setup and perform the hardening + password set.
if mariadb -e "SELECT 1" >/dev/null 2>&1; then
  echo "Running initial MariaDB hardening and root password setup..."

  mariadb <<SQL
-- Remove anonymous users
DELETE FROM mysql.user WHERE User='';

-- Disallow remote root login (keep only local/loopback)
DELETE FROM mysql.user
  WHERE User='root'
    AND Host NOT IN ('localhost', '127.0.0.1', '::1');

-- Drop test database and privileges
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';

-- Set root password for modern MariaDB
ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';

FLUSH PRIVILEGES;
SQL
else
  echo "Skipping secure setup: cannot connect as root without password (probably already configured)."
fi

########################################
# Test connection with configured values
########################################
echo "Testing MariaDB connection as ${DB_USER}@${DB_HOST}:${DB_PORT} ..."
mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -h "${DB_HOST}" -P "${DB_PORT}" -e "SELECT VERSION() AS mariadb_version;"

echo "MariaDB installation and basic secure configuration completed."
EOF

chmod +x scripts/install_db.sh
