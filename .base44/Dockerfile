# Toolchain image for the Foundry/Hardhat contracts repo.
# Only the toolchain lives here — the application source is bind-mounted at /app
# by docker-compose.base44.yml, so edits in the sandbox are picked up without a rebuild.
FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV FOUNDRY_DIR=/opt/foundry
ENV PATH=/opt/foundry/bin:$PATH

RUN curl -L https://foundry.paradigm.xyz | bash \
    && /opt/foundry/bin/foundryup

WORKDIR /app
