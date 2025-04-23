#!/bin/sh

# Start Nginx in the background
nginx -g "daemon off;" &

# Start logrotate in the foreground
crond -f -l 8 