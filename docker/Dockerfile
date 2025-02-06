FROM alpine:edge
ARG packageId

COPY ${packageId} /opt/testcafe/${packageId}
COPY docker/testcafe-docker.sh /opt/testcafe/docker/testcafe-docker.sh

ENV ALPINE_REPOS="\
 --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing/\
 --repository http://dl-cdn.alpinelinux.org/alpine/edge/community/\
 --repository http://dl-cdn.alpinelinux.org/alpine/edge/main/\
 --repository http://dl-cdn.alpinelinux.org/alpine/v3.11/community/\
 --repository http://dl-cdn.alpinelinux.org/alpine/v3.17/main/\
"

RUN apk --no-cache $ALPINE_REPOS upgrade && \
 apk --no-cache $ALPINE_REPOS add \
 libevent nodejs npm chromium chromium-lang firefox xwininfo xvfb dbus eudev ttf-freefont fluxbox procps tzdata

RUN npm install -g /opt/testcafe/${packageId} && \
 npm cache clean --force && \
 rm -rf /tmp/* && \
 chmod +x /opt/testcafe/docker/testcafe-docker.sh && \
 adduser -D user && \
 rm /opt/testcafe/${packageId}


USER user
EXPOSE 1337 1338
ENTRYPOINT ["/opt/testcafe/docker/testcafe-docker.sh"]


