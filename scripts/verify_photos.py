#!/usr/bin/env python3
"""Verify rover photo IDs and captions against the NASA raw-images API."""
import json, urllib.request

photos = json.load(open('public/data/station_photos.json'))
for name, ph in photos.items():
    api = f"https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol={ph['sol']}&num=500"
    imgs = json.load(urllib.request.urlopen(api)).get('images', [])
    hit = next((im for im in imgs if im['imageid'].startswith(ph['imageid'])), None)
    if not hit:
        print(f"{name}: imageid {ph['imageid']} NOT FOUND in NASA sol {ph['sol']} feed - UNAVAILABLE"); continue
    cap_ok = ph['caption'].replace('\n', ' ')[:60] in hit['caption'].replace('\n', ' ') or f"Sol {ph['sol']}" in hit['caption']
    print(f"{name}: sol {hit['sol']} camera {hit['camera']['filter_name'] if isinstance(hit.get('camera'), dict) else hit.get('camera')} - caption/sol match: {cap_ok}")
    print(f"  NASA page: https://mars.nasa.gov/mars2020/multimedia/raw-images/{hit['imageid']}")
