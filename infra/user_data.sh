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

# --- Root dir the deploy pipeline syncs per-container subdirs into ---
mkdir -p /home/ec2-user/containers
chown ec2-user:ec2-user /home/ec2-user/containers
