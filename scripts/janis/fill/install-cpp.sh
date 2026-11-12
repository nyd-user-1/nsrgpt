#!/bin/bash
# Brief 73: endf-parserpy 0.18.0 with its C++ parser (EndfParserCpp) into a parse box's /opt/parse venv, from the build
# made once on nsr-a73-p5 (same AMI and Python 3.12; INSTALL_ENDF_PARSERPY_CPP=yes, -O2). EndfParserPy is unchanged; the
# C++ parser gives the same rows (20 FENDL-3.1b materials, 104 tables identical) at about 6 times the speed, and
# mf415_local.py --cpp uses it. Safe while parses run: the version is the same, only the compiled modules are added.
set -e
SP=/opt/parse/lib/python3.12/site-packages
/snap/bin/aws s3 cp s3://nsr-lake-613473203863/lake/_work/fill/a73/endf_parserpy_cpp.tgz /tmp/epc.tgz --region us-east-2 --quiet
mkdir -p /tmp/epc && tar xzf /tmp/epc.tgz -C /tmp/epc
cp -r /tmp/epc/endf_parserpy/. $SP/endf_parserpy/
/opt/parse/bin/python -c "from endf_parserpy import EndfParserCpp; EndfParserCpp(array_type='list'); print('cpp ok')"
