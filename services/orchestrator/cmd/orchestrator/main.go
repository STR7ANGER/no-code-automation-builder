package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3020"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "orchestrator"})
	})
	server := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 5000000000}
	log.Printf("orchestrator listening on %s", port)
	log.Fatal(server.ListenAndServe())
}
