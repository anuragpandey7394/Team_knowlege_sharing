mock_provider "aws" {}
variables {
  ami_id        = "ami-0123456789abcdef0"
  ssh_key_name  = "synthetic-existing-key-name"
  operator_cidr = "203.0.113.10/32"
  owner         = "synthetic-cleanup-owner"
  expires_at    = "2030-01-01T01:00:00Z"
}
run "offline_network_encryption_budget_shape" {
  command = plan
  assert {
    condition     = length(aws_security_group.validation.ingress) == 2
    error_message = "Only operator SSH/HTTPS may be exposed."
  }
  assert {
    condition     = alltrue([for rule in aws_security_group.validation.ingress : contains([22, 443], rule.from_port) && rule.from_port == rule.to_port && toset(rule.cidr_blocks) == toset([var.operator_cidr]) && rule.protocol == "tcp"])
    error_message = "Unexpected public/database/API exposure."
  }
  assert {
    condition     = aws_instance.validation.root_block_device[0].encrypted && aws_instance.validation.root_block_device[0].delete_on_termination
    error_message = "Data disk must be encrypted and removed on termination."
  }
  assert {
    condition     = aws_instance.validation.metadata_options[0].http_tokens == "required"
    error_message = "IMDSv2 is required."
  }
  assert {
    condition     = aws_instance.validation.tags.Project == var.project_name && aws_instance.validation.tags.Owner == var.owner && aws_instance.validation.tags.ExpiresAt == var.expires_at
    error_message = "Project ownership/deadline tags required."
  }
  assert {
    condition     = aws_instance.validation.instance_initiated_shutdown_behavior == "stop" && strcontains(aws_instance.validation.user_data, "shutdown -h +60")
    error_message = "Bound validation compute lifetime."
  }
}
run "reject_public_operator_scope" {
  command = plan
  variables {
    operator_cidr = "0.0.0.0/0"
  }
  expect_failures = [var.operator_cidr]
}
