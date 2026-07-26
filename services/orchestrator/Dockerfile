FROM golang:1.23-alpine AS build
WORKDIR /src
COPY services/orchestrator ./
RUN CGO_ENABLED=0 go build -trimpath -o /orchestrator ./cmd/orchestrator

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /orchestrator /orchestrator
EXPOSE 3020
ENTRYPOINT ["/orchestrator"]
