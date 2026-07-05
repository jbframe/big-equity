# Use the account's default VPC + subnets so there's no networking to manage.
data "aws_vpc" "default" {
  default = true
}

# Latest Amazon Linux 2023 AMI, resolved at apply time (no hardcoded AMI IDs).
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_key_pair" "deploy" {
  key_name   = "${var.project_name}-deploy-key"
  public_key = file("${path.module}/ec2_deploy_key.pub")
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-sg"
  description = "SSH from my IP; optional HTTP/HTTPS from anywhere"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = var.ssh_open ? "SSH (open to the world; box is key-only)" : "SSH (locked to my IP)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_open ? ["0.0.0.0/0"] : [var.my_ip_cidr]
  }

  # 80 answers ACME challenges and redirects to 443; 443 is TLS at the
  # reverseProxy container (ADR-001 pattern, containerized in ADR-009).
  dynamic "ingress" {
    for_each = var.open_web ? [80, 443] : []
    content {
      description = ingress.value == 80 ? "HTTP (ACME challenges; redirects to HTTPS)" : "HTTPS (reverseProxy TLS termination)"
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-sg" }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.app.id]
  # Lets the box write pg_dump backups to S3 (ADR-003) — see db_backups.tf.
  iam_instance_profile = aws_iam_instance_profile.app.name

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    backup_bucket = aws_s3_bucket.db_backups.bucket
  })

  # user_data only runs at first boot; an in-place update would leave the box
  # stale. Recreate instead — see "Rebuilding the box" in the README.
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 20 # GB — the default 8 fills up fast with Docker images
    volume_type = "gp3"
  }

  tags = { Name = var.project_name }
}

# Stable public IP so the GitHub EC2_HOST secret never changes across reboots.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
}
