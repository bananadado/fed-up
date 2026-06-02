#!/usr/bin/env python3
"""Lightweight nvidia-smi Prometheus exporter."""
import subprocess
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

def get_gpu_metrics():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return ""
        values = result.stdout.strip().split(", ")
        if len(values) < 5:
            return ""
        gpu_util, mem_used, mem_total, temp, power = values
        return (
            f"# HELP nvidia_gpu_utilization GPU utilization percentage\n"
            f"# TYPE nvidia_gpu_utilization gauge\n"
            f"nvidia_gpu_utilization {gpu_util}\n"
            f"# HELP nvidia_gpu_memory_used_mb GPU memory used in MB\n"
            f"# TYPE nvidia_gpu_memory_used_mb gauge\n"
            f"nvidia_gpu_memory_used_mb {mem_used}\n"
            f"# HELP nvidia_gpu_memory_total_mb GPU memory total in MB\n"
            f"# TYPE nvidia_gpu_memory_total_mb gauge\n"
            f"nvidia_gpu_memory_total_mb {mem_total}\n"
            f"# HELP nvidia_gpu_temperature GPU temperature in celsius\n"
            f"# TYPE nvidia_gpu_temperature gauge\n"
            f"nvidia_gpu_temperature {temp}\n"
            f"# HELP nvidia_gpu_power_watts GPU power draw in watts\n"
            f"# TYPE nvidia_gpu_power_watts gauge\n"
            f"nvidia_gpu_power_watts {power}\n"
        )
    except Exception:
        return ""

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/metrics":
            body = get_gpu_metrics().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"nvidia-smi exporter - /metrics")

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 9835), Handler)
    print("nvidia-smi exporter on :9835/metrics")
    server.serve_forever()
