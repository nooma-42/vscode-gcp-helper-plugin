variable "create_node_pool" {
  type    = bool
  default = true
}

resource "google_compute_network" "main" {
  name                    = "gke-fixture"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "nodes" {
  name          = "gke-nodes"
  region        = "europe-west1"
  ip_cidr_range = "10.40.0.0/20"
  network       = google_compute_network.main.id
}

resource "google_container_cluster" "main" {
  name       = "fixture-cluster"
  location   = google_compute_subnetwork.nodes.region
  network    = google_compute_network.main.name
  subnetwork = google_compute_subnetwork.nodes.name

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }
}

resource "google_container_node_pool" "main" {
  count = var.create_node_pool ? 1 : 0

  name       = "fixture-pool"
  location   = google_container_cluster.main.location
  cluster    = google_container_cluster.main.name
  node_count = 1

  node_config {
    machine_type = "e2-standard-2"
    labels = {
      cluster = google_container_cluster.main.name
    }
  }
}
