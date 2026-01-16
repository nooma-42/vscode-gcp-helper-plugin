resource "google_compute_network" "main" {
  name                    = "database-network"
  auto_create_subnetworks = false
}

resource "google_compute_global_address" "service_range" {
  name          = "database-service-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.service_range.name]
}

resource "google_sql_database_instance" "primary" {
  name             = "private-postgres"
  database_version = "POSTGRES_15"
  region           = "europe-west1"

  settings {
    tier = "db-f1-micro"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.self_link
    }
  }

  depends_on = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "application" {
  name     = "application"
  instance = google_sql_database_instance.primary.name
}

resource "google_sql_user" "application" {
  name     = "application"
  instance = google_sql_database_instance.primary.name
  password = "fixture-only-not-a-real-secret"
}
