resource "google_container_cluster" "production" {
  name     = "demo-production"
  location = google_compute_subnetwork.gke.region

  network    = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.gke.id

  remove_default_node_pool = true
  initial_node_count       = 1

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
}

resource "google_container_node_pool" "primary" {
  name     = "demo-primary"
  location = google_container_cluster.production.location
  cluster  = google_container_cluster.production.name

  node_config {
    machine_type = "e2-standard-2"
    tags         = ["gke-demo"]
  }
}
