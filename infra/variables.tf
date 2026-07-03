variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro is free-tier-eligible; bump to t3.small if Docker feels tight."
  type        = string
  default     = "t3.micro"
}

variable "my_ip_cidr" {
  description = "CIDR allowed to SSH (port 22) when ssh_open is false, e.g. 1.2.3.4/32. Set to your current IP."
  type        = string
  sensitive   = true # home IP — keep it out of plan output / CI logs
}

variable "ssh_open" {
  description = "Open SSH (port 22) to 0.0.0.0/0. Required so GitHub-hosted runners (rotating IPs) can deploy; the box is key-only, no password auth. Set false to lock SSH to my_ip_cidr."
  type        = bool
  default     = true
}

variable "open_web" {
  description = "Open HTTP/HTTPS (ports 80/443) to the world so nginx can serve the app and answer ACME challenges. Set false for non-web batch workloads."
  type        = bool
  default     = true
}

variable "app_domain" {
  description = "Hostname nginx serves simulationWeb on (ADR-001). Its DNS A record must point at the Elastic IP before certbot can issue a certificate."
  type        = string
  default     = "allin.makejohnacoffee.com"
}

variable "api_domain" {
  description = "Hostname nginx serves simulationAPI on (ADR-002). Its DNS A record must point at the Elastic IP before certbot can issue a certificate."
  type        = string
  default     = "api.makejohnacoffee.com"
}

variable "certbot_email" {
  description = "Email Let's Encrypt uses for certificate expiry / problem notices."
  type        = string
  default     = "framejb@gmail.com"
}

variable "backup_bucket_name" {
  description = "Globally-unique S3 bucket for simulationDB pg_dump backups (ADR-003). Dumps land under simulationdb/ and expire after 30 days."
  type        = string
  default     = "big-equity-db-backups-jbframe"
}

variable "project_name" {
  description = "Name tag / app directory on the box."
  type        = string
  default     = "big-equity"
}
