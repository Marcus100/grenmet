import requests,ConfigParser,os
import sqlite3 as sql


def getSendData():
    ksdbpath = config.get('DATABASE','path')
    dbpath = ksdbpath
    con = sql.connect(os.path.join(dbpath,'remote.db'))
    con.row_factory = sql.Row
    cur = con.cursor()
    cur.execute("select Sensors,Auth FROM Remote")
    rows = cur.fetchall()
    print rows
    return rows

def sendData(k,t):
    print k
    print t
    try:
       save_raw = config.get("DEBUG","raw")
    except:
       save_raw = False
    print save_raw
    sendData = getSendData()
    sensor_list = sendData[0][0]
    send_key = sendData[0][1]
    package = 'key='+send_key
    for x in range(0,len(k)-1):
        if k[x] in sensor_list:
            package = package +',' + k[x] + '='+k[x+1]
    package = package +',time=' + t
    if save_raw == True:
       with open("/home/data/Sutron_Linux/KaleidoScope/raw.txt","a") as g:
          g.write(package)
          g.write("\n")
    return package

def SendUnsent(package):
    print "in the SendUnsent"
    response = "An Error has occured while sending to remote Database! - Unsent"
    resp = False
    srv_time = 9999
    URL = config.get('INIT','server')
    srv_timeout = config.getint('INIT','delay')
    try:
       r = requests.post(url = URL,data=package, timeout=srv_timeout)
       response = r.text
       resp = True
       
    except:
       pass
    print response,srv_time
    return resp,srv_time 

def CentralSend(k,t):
    print "Server 1"
    response = "An Error has occured while sending to remote Database!"
    URL = config.get('INIT','server')
    srv_timeout = config.getint('INIT','delay')
    data = sendData(k,t)
    print data
    try:
       r = requests.post(url = URL,data=data, timeout=srv_timeout)
       response = r.text
    except:
       f = open('/home/data/Sutron_Linux/Script/unsent_server1.txt','a')
       f.write(data)
       f.write('\n')
    print response
    return response


#program start
config = ConfigParser.ConfigParser()
config.read('/home/data/Sutron_Linux/Script/ks.config')
debug = False
if __name__ == '__main__':
   pass
else:
   pass
