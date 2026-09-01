"""Vendor-neutral, opt-in OpenTelemetry application telemetry.

The package initializer deliberately imports nothing: lightweight call-site
facades must not pull the infrastructure bootstrap into domain imports.
"""
