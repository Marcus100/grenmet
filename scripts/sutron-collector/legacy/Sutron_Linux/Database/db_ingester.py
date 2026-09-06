#!/usr/bin/python

import sqlite3
from time import *
import time
import os
import sys

sub = 1

if os.path.isfile('/home/data/Sutron_Linux/Database/db_ingester.conf'):
    config = open('/home/data/Sutron_Linux/Database/db_ingester.conf','r')
    lines = config.readlines()
    config.seek(0)
    config.readline()
    for x in range(0,len(lines)-1):
        line=config.readline()
        if line[0] <> '#':
            line = line.split('=')
            if line[0] == 'file_path':
                file_path = line[1][0:len(line[1])-sub]
                print file_path
            if line[0] == 'file_name':
                file_name = line[1][0:len(line[1])-sub]
                print file_name
            if line[0] == 'database_path':
                database_path = line[1][0:len(line[1])-sub]
            if line[0] == 'divisor':
                MULTIPLIER = line[1][0:len(line[1])-sub]
                print MULTIPLIER
            if line[0] == 'station_ID':
                Station_ID = line[1][0:len(line[1])-sub]
                print Station_ID
            if line[0] == 'database_name':
                database_file = line[1][0:len(line[1])-sub]

                print "this is the database file " + database_file
                if os.path.isfile(database_file):
                    make_db = open(database_file)
                    db_lines = make_db.readlines()
                    make_db.seek(0)
                    for y in range(0,len(db_lines)-1):
                        db_line = make_db.readline()
                        db_line = db_line.split('=')
                        #print db_line[0]
                        if db_line[0]=='database_name':
                            database_name = db_line[1][0:len(db_line[1])-sub]
                            print database_name
                            

print "this is the file path" + database_path + database_name
conn = sqlite3.connect(database_path + database_name)
c = conn.cursor()
divisor = int(MULTIPLIER)

print file_name
if os.path.isfile(file_name):
    file_ = open(file_name,'r')
    ftp_file = file_.readline()
    print ftp_file
    file_.close()
else:
    print "file not found"

print file_path+ftp_file
ftp_file = ftp_file[0:len(ftp_file)]
print file_path+ftp_file
if os.path.isfile(file_path+ftp_file):
    ftp_data = open(file_path+ftp_file,'r')
    first_line = ftp_data.readline()
    print first_line
    first_line = first_line.split(" ")
    second_line = ftp_data.readline()
    print second_line
    second_line = second_line.split()
    ftp_data.close()
else:
    print "file not found"

station_name = "UNKNOWN"
station_name = first_line[5].split(".")
if (len(station_name) > 1):
    station_name = station_name[0]
    date_time = '20'+second_line[2]+'-'+second_line[1]+'-'+second_line[0]+' '+second_line[3]+':'+second_line[4]+':00'
    

WSA_Val = '-9999'
WDA_Val = '-9999'
AT_Val = '-9999'
RAIN_Val = '-9999'
GUSTDIR_Val = '-9999'
BATTERY_Val = '-9999'
QNH_Val = '-9999'
RH_Val = '-9999'
WDI_Val = '-9999'
WSI_Val = '-9999'
QFE_Val = '-9999'
DP_Val = '-9999'
ATMIN_Val = '-9999'
BARO_Val = '-9999'
QFF_Val = '-9999'
ATMAX_Val = '-9999'
GUST_Val = '-9999'
SM_Val = '-9999'
ST_Val = '-9999'
SP_Val = '-9999'
EC_Val = '-9999'


#print 'the length of the second line is '+len(second_line)
for x in range(5,len(second_line)):
    variable = first_line[x].split(".")
    value = second_line[x]
    value = float(value)/divisor
    
    
    name_val = variable[1] + '_Val'
    
    if name_val == 'WSA_Val':
       WSA_Val = value
    if name_val == 'WDA_Val':
       WDA_Val = value
    if name_val == 'AT_Val':
       AT_Val = value
    if name_val == 'RAIN_Val':
       RAIN_Val = value
    if name_val == 'GUSTDIR_Val':
       GUSTDIR_Val = value
    if name_val == 'BATTERY_Val':
       BATTERY_Val = value
    if name_val == 'QNH_Val':
       QNH_Val = value
    if name_val == 'RH_Val':
       RH_Val = value
    if name_val == 'WDI_Val':
       WDI_Val = value
    if name_val == 'WSI_Val':
       WSI_Val = value
    if name_val == 'QFE_Val':
       QFE_Val = value
    if name_val == 'DP_Val':
       DP_Val = value
    if name_val == 'ATMIN_Val':
       ATMIN_Val = value
    if name_val == 'BARO_Val':
       BARO_Val = value
    if name_val == 'QFF_Val':
       QFF_Val = value
    if name_val == 'ATMAX_Val':
       ATMAX_Val = value
    if name_val == 'GUST_Val':
       GUST_Val = value

    if name_val == 'SM_Val':
       SM_Val = value
    if name_val == 'ST_Val':
       ST_Val = value
    if name_val == 'SP_Val':
       SP_Val = value
    if name_val == 'EC_Val':
       EC_Val = value
print ST_Val
print SM_Val
print SP_Val
print EC_Val

    
try:
   c.execute("INSERT INTO AWS (ID,STATION_Name,STATION_ID,RECORD_DATE,WSA,WDA,AT,RAIN,GUSTDIR,BATTERY,QNH,RH,WDI,WSI,QFE,DP,ATMIN,BARO,QFF,ATMAX,GUST,MULTIPLIER) VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          (station_name,Station_ID,date_time,WSA_Val,WDA_Val,AT_Val,RAIN_Val,GUSTDIR_Val,BATTERY_Val,QNH_Val,RH_Val,WDI_Val,WSI_Val,QFE_Val,DP_Val,ATMIN_Val,BARO_Val,QFF_Val,ATMAX_Val,GUST_Val,MULTIPLIER))
   conn.commit()
   conn.close()
   print "Record written to database."
except:
   print " A Fatal Error has occured !!"
