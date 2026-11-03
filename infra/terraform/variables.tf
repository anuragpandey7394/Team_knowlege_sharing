variable "region" {
  type    = string
  default = "ap-south-1"
}
variable "ami_id" {
  type        = string
  description = "Approved regional Ubuntu 24.04 x86_64 AMI."
  validation {
    condition     = can(regex("^ami-[a-f0-9]{17}$", var.ami_id))
    error_message = "Use an explicit AMI ID."
  }
}
variable "ssh_key_name" {
  type        = string
  description = "Existing operator key pair. No private key is stored here."
}
variable "operator_cidr" {
  type = string
  validation {
    condition     = can(cidrhost(var.operator_cidr, 0)) && endswith(var.operator_cidr, "/32")
    error_message = "Restrict access to one operator IPv4 /32."
  }
}
variable "instance_type" {
  type    = string
  default = "t3.small"
  validation {
    condition     = contains(["t3.micro", "t3.small"], var.instance_type)
    error_message = "Use a small x86 validation instance after budget approval."
  }
}
variable "project_name" {
  type    = string
  default = "tka-validation"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "Use a short lowercase project identifier."
  }
}
variable "owner" {
  type        = string
  description = "Explicit cleanup owner label."
}
variable "expires_at" {
  type        = string
  description = "Explicit RFC3339 cleanup deadline. Tags do not perform teardown."
  validation {
    condition     = can(timecmp(var.expires_at, var.expires_at))
    error_message = "Use an RFC3339 deadline."
  }
}
variable "max_lifetime_hours" {
  type    = number
  default = 1
  validation {
    condition     = contains([1, 2], var.max_lifetime_hours)
    error_message = "Stop compute within one or two hours. Disk still requires destroy."
  }
}
