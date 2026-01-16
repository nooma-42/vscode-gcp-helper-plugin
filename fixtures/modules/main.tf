resource "google_compute_network" "main" {
  name                    = "module-fixture"
  auto_create_subnetworks = false
}

module "gke_network" {
  source = "./modules/gke-network"

  network_id = google_compute_network.main.id
  region     = "europe-west1"
}

resource "google_compute_firewall" "from_module_output" {
  name    = "allow-module-subnet"
  network = google_compute_network.main.id

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = [module.gke_network.subnet_cidr]
}

output "subnet_id" {
  value = module.gke_network.subnet_id
}
