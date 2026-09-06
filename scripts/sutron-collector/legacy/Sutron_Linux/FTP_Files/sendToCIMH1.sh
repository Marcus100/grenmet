#!/bin/bash

set -- "$1"
tmpIFS=$IFS
IFS="/"
declare -a Array=($*)
IFS=$tmpIFS

FILE_NAME=${Array[${#Array[@]}-1]}
echo ${FILE_NAME}

sftp -P CIMH_PORT CIMH_USER@CIMH_HOST << ENDSFTP
cd marvin/WeatherStation/Grenada/
put ${1} temp_aws_cimh_file
rename temp_aws_cimh_file ${FILE_NAME}
quit
ENDSFTP

