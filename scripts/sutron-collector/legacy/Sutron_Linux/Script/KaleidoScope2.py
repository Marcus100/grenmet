import requests
import sqlite3 as sql


def getSendData():
    dbpath = '/home/data/Sutron_Linux/Database/'
    con = sql.connect(dbpath + 'remote.db')
    con.row_factory = sql.Row
    cur = con.cursor()
    cur.execute("select Sensors,Auth FROM Remote")
    rows = cur.fetchall()
    return rows

def sendData(k,t):
    print k
    print t
    sendData = getSendData()
    sensor_list = sendData[0][0]
    send_key = sendData[0][1]
    package = 'key='+send_key
    for x in range(0,len(k)-1):
        if k[x] in sensor_list:
            package = package +',' + k[x] + '='+k[x+1]
    package = package +',time=' + t
    return package

def CentralSend(k,t):
    response = "An Error has occured while sending to remote Database!"
    URL = "http://REMOTE_HOST:REMOTE_PORT/coral"  # REDACTED
    data = sendData(k,t)
    print data
    print "server 2"
    try:
       r = requests.post(url = URL,data=data,timeout=5)
       response = r.text
    except:
       f = open('unsent_server2.txt','a')
       f.write(data)
       f.write('\n')
    print response
    return response
     
#k=['WSA', '7.6', 'AT', '29.6', 'HRSSUN', '0.17', 'SOLRAD', '30102', 'RAIN', '0.0', 'SOLARV', '9.9', 'GUSTDIR', '81.0', 'BATTERY', '13.5', 'QNH', '1015.8', 'RH', '63.5', 'WDI', '66.0', 'WSI', '8.0', 'QFE', '1002.9', 'DP', '21.9', 'ATMIN', '29.3', 'BARO', '1002.7', 'QFF', '1015.8', 'ATMAX', '29.8', 'GUST', '14.4', 'WDA', '82.3', '']
#k=['WSA', '7.6', 'AT', '29.6', 'HRSSUN', '0.17', 'SOLRAD', '30102', 'RAIN', '0.0', 'SOLARV', '9.9', 'GUSTDIR', '81.0', 'BATTERY', '13.5', 'QNH', '1015.8', 'RH', '63.5', 'WDI', '66.0', 'WSI', '8.0', 'QFE', '1002.9', 'DP', '21.9', 'ATMIN', '29.3', 'BARO', '1002.7', 'QFF', '1015.8', 'ATMAX', '29.8', 'GUST', '14.4', 'WDA', '82.3', '']
#t='199912071530'

#CentralSend(k,t)
