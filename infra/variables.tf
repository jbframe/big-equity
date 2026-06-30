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

variable "open_http" {
  description = "Whether to open port 80 to the world. Set false for non-web batch workloads."
  type        = bool
  default     = false
}

variable "project_name" {
  description = "Name tag / app directory on the box."
  type        = string
  default     = "big-equity"
}
