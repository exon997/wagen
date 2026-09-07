# ADR: Worker infrastruktura na Hetzneru

Datum: 2026-09-07 · Status: prihvaceno

## Odluka
Pozadinski poslovi (15.6: Node worker) i Meilisearch zive na jednom
Hetzner Cloud VPS-u umjesto na PaaS-u (Railway).

- Server: **wagen-worker-1** (cx33: 4 vCPU / 8 GB, Ubuntu 24.04, nbg1),
  IP 46.225.232.174, ~10,6 EUR/mj gross.
- Obrazlozenje: profil "uvijek upaljen Meilisearch + burst video render"
  na Railwayu kosta 40-100+ USD/mj (20 USD/vCPU + 10 USD/GB RAM);
  fiksni VPS ne raste s brojem videa. Ops radi Claude preko SSH-a.
- Meilisearch v1.16 u Dockeru (--restart always), podaci u
  /opt/wagen/meili_data, MEILI_ENV=production, master kljuc u .env.local
  (MEILI_MASTER_KEY). Port 7700 javan ali zasticen kljucem; ufw: 22, 7700.
- SSH: kljuc ~/.ssh/wagen_hetzner (razvojni stroj), user root.
- Sljedece na serveru: apps/render-worker (Remotion + ffmpeg, Docker).

## Ponovno stvaranje
HCLOUD_TOKEN u .env.local; API poziv POST /servers (cx33, ubuntu-24.04,
ssh kljuc "wagen-claude"), zatim get.docker.com + docker run meilisearch
(vidi transkript 2026-09-07 / ovaj ADR).
