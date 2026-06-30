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

variable "ssh_pubkey_path" {
  description = "Path to the SSH public key uploaded to the instance for deploys."
  type        = string
  default     = "~/.ssh/ec2_deploy_key.pub"
}

variable "my_ip_cidr" {
  description = "CIDR allowed to SSH (port 22), e.g. 1.2.3.4/32. Set to your current IP."
  type        = string
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
