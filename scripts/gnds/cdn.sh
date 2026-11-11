#!/usr/bin/env bash
# Brief 60: serve lake/gnds/* (the precompiled GNDS files) and lake/jobs/* (job outputs, the on-demand GNDS files among
# them) through nsr-api's CloudFront distribution (Comment nsr-api), so a file's URL is
# https://daw1qggkn69lv.cloudfront.net/lake/gnds/<release>/<sub>/<mat>.xml.gz. Until now the distribution had one
# origin, the API. This adds the bucket as a second origin (Id nsr-lake) through the existing origin access control
# nsr-lake-site, two behaviors (/lake/gnds/* and /lake/jobs/*, GET and HEAD, AWS's managed CachingOptimized policy), and
# a bucket-policy statement (Sid CloudFrontReadsNsrApi) letting that distribution read those two prefixes only.
# Brief 70 (elpis-fill, 2026-11-11): a third behavior, /lake/janis/* (the marked JANIS tree the Elpis pages read,
# lake/janis/current/ written by scripts/janis/mark.py with Cache-Control max-age=300), with AWS's managed SimpleCORS
# response headers since the site fetches it from its own origin; the bucket policy covers lake/janis/* too.
# Idempotent; one AWS CLI call at a time.
set -euo pipefail
A=(--profile nysgpt-new --region us-east-2)
ACCT=613473203863
BUCKET=nsr-lake-613473203863
T=$(mktemp -d)
DIST=$(aws cloudfront list-distributions "${A[@]}" --query "DistributionList.Items[?Comment=='nsr-api'].Id | [0]" --output text)
OAC=$(aws cloudfront list-origin-access-controls "${A[@]}" --query "OriginAccessControlList.Items[?Name=='nsr-lake-site'].Id | [0]" --output text)
aws cloudfront get-distribution-config --id "$DIST" "${A[@]}" --output json > $T/d.json
ETAG=$(jq -r .ETag $T/d.json)
jq --arg oac "$OAC" --arg dom "$BUCKET.s3.us-east-2.amazonaws.com" '
  .DistributionConfig
  | .Origins.Items |= (map(select(.Id != "nsr-lake")) + [{Id: "nsr-lake", DomainName: $dom, OriginPath: "",
      CustomHeaders: {Quantity: 0}, S3OriginConfig: {OriginAccessIdentity: ""}, OriginAccessControlId: $oac,
      ConnectionAttempts: 3, ConnectionTimeout: 10, OriginShield: {Enabled: false}}])
  | .Origins.Quantity = (.Origins.Items | length)
  | .CacheBehaviors.Items = (((.CacheBehaviors.Items // []) | map(select(.PathPattern != "/lake/gnds/*" and .PathPattern != "/lake/jobs/*" and .PathPattern != "/lake/janis/*")))
      + [("/lake/gnds/*", "/lake/jobs/*", "/lake/janis/*") | {PathPattern: ., TargetOriginId: "nsr-lake", ViewerProtocolPolicy: "redirect-to-https",
          AllowedMethods: {Quantity: 2, Items: ["GET", "HEAD"], CachedMethods: {Quantity: 2, Items: ["GET", "HEAD"]}},
          Compress: false, SmoothStreaming: false, FieldLevelEncryptionId: "",
          CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
          LambdaFunctionAssociations: {Quantity: 0}, FunctionAssociations: {Quantity: 0}}
          + (if . == "/lake/janis/*" then {ResponseHeadersPolicyId: "60669652-455b-4ae9-85a4-c4c02393f86c"} else {} end)])
  | .CacheBehaviors.Quantity = (.CacheBehaviors.Items | length)' $T/d.json > $T/new.json
aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config file://$T/new.json "${A[@]}" \
  --query 'Distribution.[Id,Status,DistributionConfig.CacheBehaviors.Quantity]' --output text
aws s3api get-bucket-policy --bucket $BUCKET "${A[@]}" --query Policy --output text > $T/p.json
jq --arg arn "arn:aws:cloudfront::$ACCT:distribution/$DIST" --arg b "arn:aws:s3:::$BUCKET" '
  .Statement |= (map(select(.Sid != "CloudFrontReadsNsrApi")) + [{Sid: "CloudFrontReadsNsrApi", Effect: "Allow",
    Principal: {Service: "cloudfront.amazonaws.com"}, Action: "s3:GetObject",
    Resource: [($b + "/lake/gnds/*"), ($b + "/lake/jobs/*"), ($b + "/lake/janis/*")], Condition: {StringEquals: {"AWS:SourceArn": $arn}}}])' $T/p.json > $T/p2.json
aws s3api put-bucket-policy --bucket $BUCKET --policy file://$T/p2.json "${A[@]}"
echo "distribution $DIST: /lake/gnds/*, /lake/jobs/* and /lake/janis/* -> s3://$BUCKET (OAC $OAC)"
rm -rf $T
