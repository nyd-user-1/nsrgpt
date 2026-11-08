# Parse box (brief 15)

Launch: `./scripts/parse/box/create.sh nsr-parse-1` (role nsr-parse-box, 24-hour self-shutdown; reach it with `scripts/iaea/box/ssm.sh <id> '<command>'`). Scripts go to the box through S3: `aws s3 sync scripts/parse s3://nsr-lake-613473203863/lake/_work/parse/ --exclude 'exfor/*'` on the Mac, then `aws s3 cp --recursive` of `lake/_work/parse/{box,ensdf,endfb}/` to `/opt/parse/scripts/` on the box. `lake.py` holds the shared Parquet, upload and Athena helpers; `nsr_count.py` is an unchanged copy of `services/nsr-count/lambda_function.py`, used as the counts check.
