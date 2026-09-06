#!/bin/bash
#exec &>> /home/data/log/capture_CIMH1.txt 
#above output will be send from the cronjob and not from the script
echo " "
echo "Running Cron-Job sendCIMH1.sh at $(date)"
filesend=`cat /home/data/Sutron_Linux/FTP_Files/test_filename.txt`
echo $filesend
cd /home/data/Sutron_Linux/FTP_Files/
./sendToCIMH1.sh $filesend

