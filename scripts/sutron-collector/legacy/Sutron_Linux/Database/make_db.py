#!/usr/bin/python

#This script makes database from the settings in the make_db.conf file.


import sqlite3
from time import *
import time
import os
import sys

timestamp = strftime("%H_%M",localtime())

if os.path.isfile('make_db.conf'):
    config = open('make_db.conf','r')
    print "in the config"
    lines = config.readlines()
    config.seek(0)
    line = config.readline()
    line = line.split()
    if line[0][0] == '#':
        print "Valid Configuration file found..."
        line = config.readline()
        print line
        line = line.split('=')
        print line[1]
        if len(line) > 1:
            database_name = line[1][0:(len(line[1])-1)]
            print database_name
            database_setup = config.readline()
            database_setup = database_setup.split('=')
            database_setup = database_setup[1][0:(len(database_setup[1])-1)]
            print database_setup
        else:
            print 'Not a valid configuration file'
            print 'Reverting to default database name default.db'
            database_name = 'default.db'
else:
    print 'No valid config file, make_db.conf was found!'
    print 'creating default file'
    config = open('make_db.conf','w')
    config.write('#make_db.config. Please do not alter this unless otherwise instructed!\n')
    config.write('database_name=default.db\n')
    config.write('setup=CREATE TABLE CIMH_AWS(ID INTEGER PRIMARY KEY,STATION_Name CHARACTER,STATION_ID INTEGER,RECORD_DATE DATETIME,WSA DECIMAL(6,2),AT DECIMAL(5,2),RAIN DECIMAL(6,2),GUSTDIR DECIMAL(6,2),BATTERY DECIMAL(4,2),QNH DECIMAL(6,2),RH DECIMAL(5,2),WDI DECIMAL(5,2),WSI DECIMAL(6,2),QFE DECIMAL(6,2),DP DECIMAL(5,2),ATMIN DECIMAL(5,2),BARO DECIMAL(6,2),QFF DECIMAL(6,2),ATMAX DECIMAL(5,2),GUST DECIMAL(6,2),MULTIPLIER INTEGER(4))')
    config.close()
    database_name = 'default.db'
    database_setup= 'CREATE TABLE CIMH_AWS(ID INTEGER PRIMARY KEY,STATION_Name CHARACTER,STATION_ID INTEGER,RECORD_DATE DATETIME,WSA DECIMAL(6,2),AT DECIMAL(5,2),RAIN DECIMAL(6,2),GUSTDIR DECIMAL(6,2),BATTERY DECIMAL(4,2),QNH DECIMAL(6,2),RH DECIMAL(5,2),WDI DECIMAL(5,2),WSI DECIMAL(6,2),QFE DECIMAL(6,2),DP DECIMAL(5,2),ATMIN DECIMAL(5,2),BARO DECIMAL(6,2),QFF DECIMAL(6,2),ATMAX DECIMAL(5,2),GUST DECIMAL(6,2),MULTIPLIER INTEGER(4))'
conn = sqlite3.connect(database_name)
c = conn.cursor()
try:
    c.execute(database_setup)
except:
    print "Invalid database setup"
    
conn.commit()
conn.close()
