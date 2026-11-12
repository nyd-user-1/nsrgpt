#!/bin/bash
# Brief 77 step 3: a box ready to run JANIS 4.1: Java 8 (JDK, for the harness), Xvfb (JANIS is a Swing program),
# 7-Zip, CFR to read JANIS's classes, and JANIS's jars from lake/_raw/janis-software/ in /opt/janis.
#   bash setup.sh
set -euo pipefail
export PATH=$PATH:/snap/bin DEBIAN_FRONTEND=noninteractive
L=s3://nsr-lake-613473203863/lake/_raw/janis-software
apt-get update -q >/dev/null
apt-get install -y -q openjdk-8-jdk-headless openjdk-8-jre xvfb p7zip-full jq unzip >/dev/null
update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java || true
mkdir -p /opt/janis /opt/janis-tools
[ -d /data/janis-software/janis/webstart ] || aws s3 sync $L /data/janis-software --only-show-errors
cp /data/janis-software/janis/webstart/*.jar /opt/janis/
[ -f /opt/janis-tools/cfr.jar ] || curl -s -L -o /opt/janis-tools/cfr.jar https://repo1.maven.org/maven2/org/benf/cfr/0.152/cfr-0.152.jar
java -version 2>&1 | head -1
ls /opt/janis | wc -l
