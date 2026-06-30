#!/bin/bash
set -eux

# --- Docker engine ---
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

# --- Docker Compose v2 (CLI plugin) ---
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# --- Post-quantum SSH key exchange ---
# AL2023 ships OpenSSH 8.7, which supports the sntrup761x25519 hybrid KEX but
# doesn't enable it by default. Prefer it so clients don't fall back to a
# classical-only exchange (avoids the "not using a post-quantum key exchange"
# warning and store-now-decrypt-later exposure). mlkem768 would need OpenSSH 9.9+.
cat >/etc/ssh/sshd_config.d/50-pq-kex.conf <<'EOF'
KexAlgorithms sntrup761x25519-sha512@openssh.com,curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
EOF
sshd -t && systemctl restart sshd

# --- Root dir the deploy pipeline syncs per-container subdirs into ---
mkdir -p /home/ec2-user/containers
chown ec2-user:ec2-user /home/ec2-user/containers
