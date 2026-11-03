locals {
  tags = { Project = var.project_name, ManagedBy = "Terraform", Owner = var.owner, ExpiresAt = var.expires_at }
}
resource "aws_vpc" "validation" {
  cidr_block           = "10.84.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = local.tags
}
resource "aws_subnet" "validation" {
  vpc_id                  = aws_vpc.validation.id
  cidr_block              = "10.84.1.0/24"
  map_public_ip_on_launch = true
  tags                    = local.tags
}
resource "aws_internet_gateway" "validation" {
  vpc_id = aws_vpc.validation.id
  tags   = local.tags
}
resource "aws_route_table" "validation" {
  vpc_id = aws_vpc.validation.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.validation.id
  }
  tags = local.tags
}
resource "aws_route_table_association" "validation" {
  subnet_id      = aws_subnet.validation.id
  route_table_id = aws_route_table.validation.id
}
resource "aws_security_group" "validation" {
  name_prefix = "${var.project_name}-"
  description = "Operator-only SSH and HTTPS. No database/API port published."
  vpc_id      = aws_vpc.validation.id
  dynamic "ingress" {
    for_each = toset([22, 443])
    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = [var.operator_cidr]
    }
  }
  dynamic "egress" {
    for_each = toset([80, 443])
    content {
      from_port   = egress.value
      to_port     = egress.value
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }
  egress {
    description = "VPC DNS"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = [aws_vpc.validation.cidr_block]
  }
  tags = local.tags
}
resource "aws_instance" "validation" {
  ami                                  = var.ami_id
  instance_type                        = var.instance_type
  subnet_id                            = aws_subnet.validation.id
  vpc_security_group_ids               = [aws_security_group.validation.id]
  key_name                             = var.ssh_key_name
  associate_public_ip_address          = true
  instance_initiated_shutdown_behavior = "stop"
  monitoring                           = false
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 16
    encrypted             = true
    delete_on_termination = true
    tags                  = local.tags
  }
  user_data = <<-SCRIPT
    #!/bin/bash
    set -eu
    shutdown -h +${var.max_lifetime_hours * 60}
    export DEBIAN_FRONTEND=noninteractive
    timeout 600 apt-get update
    timeout 600 apt-get install -y docker.io docker-compose-v2
    systemctl enable --now docker
    # Operator must configure trusted HTTPS, private env injection and verified images.
    # No secret, model call, application start or automatic cloud apply occurs here.
    # Shutdown limits compute time. Cleanup owner must still destroy disk/resources.
  SCRIPT
  tags      = merge(local.tags, { Name = var.project_name })
}
