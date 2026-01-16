locals {
  subnet_name = "module-gke-subnet"
}

resource "google_compute_subnetwork" "gke" {
  name          = local.subnet_name
  region        = var.region
  ip_cidr_range = "10.50.0.0/20"
  network       = var.network_id
}
