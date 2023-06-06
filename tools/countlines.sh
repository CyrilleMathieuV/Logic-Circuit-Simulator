#!/bin/bash
root="$(dirname "$0")/.."
cd "$root"
find simulator -name '*.ts' -o -name '*.html' -o -name '*.css' -o -name '*.svg' | xargs wc -l
