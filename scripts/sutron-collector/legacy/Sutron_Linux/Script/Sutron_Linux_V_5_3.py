#!/usr/bin/python
#24th October 2016- Added Met Obervation Console string
#10th November 2016- Added try except to detect when MOC system offline
#24th April 2017 - removed the CIMH. in the heading of the FTP file
#06th February 2018 - Added the table row shading
#07th February 2018 - Added table headings hover shading
#20th November 2018 - Added KaleidoScope send
#13th December 2018 - Added the Database write and removed it from the crontab 
from time import *
import time
import serial
import smtplib
import Gnuplot
import sys
import os
import ftplib
import MySQLdb
import ConfigParser
import socket
import KaleidoScope as ks
def get_month(x):
    month_value = x[4] + x[5]
    if month_value == "01":
       month_value = "January"
    if month_value == "02":
       month_value = "February"
    if month_value == "03":
       month_value = "March"
    if month_value == "04":
       month_value = "April"
    if month_value == "05":
       month_value = "May"
    if month_value == "06":
       month_value = "June"
    if month_value == "07":
       month_value = "July"
    if month_value == "08":
       month_value = "August"
    if month_value == "09":
       month_value = "September"
    if month_value == "10":
       month_value = "October"
    if month_value == "11":
       month_value = "November"
    if month_value == "12":
       month_value = "December"

    return month_value

def ping_check(address):
    print " Trying to verify internet connectivity "	
    print(" pinging " + address + " .")
    ping_result = os.system('ping ' + address + ' -c 1')
    if ping_result == '0':
       print " Ping to " + address + " was successful."
    return ping_result
    

def get_sensor(tag):
    sensor_value = 'N/A'
    for v in range(len(data_split)):
       if data_split[v] == tag:
          sensor_value = data_split[v+1]
    return sensor_value

def Sutron_command(send_cmd):
    print "in Sutron Command"
    ser.write(send_cmd)
    ser.write("\r")
    ser.write("\n")
    return 0

def Create_FTP(sensor_data):
    ks.CentralSend(sensor_data,ks_time)
    if debug == 1:
       print " "
       print sensor_data
       print " "
       print " Creating the FTP File to send . . . "
       print " "
    if os.path.exists(path + '/FTP_Files'):
        ftp_file = open(path + 'FTP_Files/' + format + '_' + hours + minutes + '.asc','w')
    else:
        print " "
        print " Creating the FTP_Files Folder "
        print " "
        os.mkdir(path + '/FTP_Files')
        ftp_file = open(path + 'FTP_Files/' + format + '_' + hours + minutes + '.asc','w')
    ftp_file.write("gg mm aa hh nn ")
    for counter in range(0,(len(sensor_data)-1),2):
        FTP_sensor = stationname + "." + sensor_data[counter]
        ftp_file.write(FTP_sensor)
        ftp_file.write(" ")
    ftp_file.write("\n")
    ftp_file.write(day)
    ftp_file.write(" ")
    ftp_file.write(month)
    ftp_file.write(" ")
    ftp_file.write(yr)
    ftp_file.write(" ")
    ftp_file.write(hours)
    ftp_file.write(" ")
    ftp_file.write(minute)
    ftp_file.write(" ")

    for counter in range(1,(len(sensor_data)-1),2):
        if debug == 1:
           print counter
           print sensor_data[counter]
        sensor_val = sensor_data[counter]
        if sensor_val == "":
            sensor_val = "-9999"
        if sensor_val == " ":
            sensor_val = "-9999"
        if sensor_val == "Sensor":
            sensor_val = "-9999"
        if sensor_val <> "-9999":    
            sensor_val = float(sensor_val)
            sensor_val = sensor_val * multiplier
            sensor_val = int(sensor_val)
            sensor_val = str(sensor_val)
        sensor_names = stationname + "." + sensor_data[counter-1]    
        difference = len(sensor_names) - len(sensor_val)
        if debug == 1:
           print sensor_names
           print " the difference is "
           print difference
        for k in range(0,difference):
            ftp_file.write(" ")
        ftp_file.write(sensor_val)
        ftp_file.write(" ")
    ftp_file.write("\n")
    ftp_file.write("\n")
    ftp_file.write("\n")
    ftp_file.close()

    print 'The ' + format + '_' + hours + minutes + '.asc'  + ' file was created...'

    last = open(path + 'FTP_Files/test_filename.txt','wb')
    last.write(format + '_' + hours + minutes + '.asc')
    last.close()
    os.system("python /home/data/Sutron_Linux/Database/db_ingester.py")
    return 0

def Create_HTML(sensor_html):
    print " "
    print "Creating the AWS Observer file"
    print " "

    html  = open(path + 'HTML/index.html','w')
    header = "<html>\n<head>\n<style>\nimg {\n\tmax-width: 100%;\n\theight: auto;\n\twidth: auto\9;\n\t}\n"
    html.write(header)
    header = "div {\ndisplay: inline-block;\nwhite-space: nowrap;\n}\n.img1,.img2,.img3,.img4{\n\twidth:25%;\n}\n  tr:nth-child(even) td{\n\tbackground: #DDD;\n}\ntr:hover{\n\tbackground: #BBB;\n}\ntable,th,td{\n\tborder:1px solid black;\n\tborder-collapse:collapse;\n}</style>\n"
    html.write(header)
    header = "<title> AWS Observer </title>\n</head>\n"
    html.write(header)
    header = "<body>\n<table border=1 align=center>\n\t<tr>\n\t\t<th colspan=4 align=center> MAURICE BISHOP INTERNATIONAL AIRPORT AWS OBSERVER</th>\n\t</tr>"
    html.write(header)
    html_month = get_month(format)
    html_date = "\n\n\t<tr>\n\t\t<th colspan=2 align=center> Date : " + format[6] + format[7] + " " + html_month + " " + format[0] + format[1] +format [2] + format[3] + "</th>"
    html.write(html_date)

    html_time = "\n\t\t<th colspan=2 align=center> Time :  " + hour + ":" + minutes  + "</th>\n\t\n\t</tr>"
    html.write(html_time)

    html_table_headers = "\n\n\t<tr>\n\t\t<th width=220 align=left> Variable</th>\n\t\t<th width=140 align=left> Value </th>\n\t\t<th width=220 align=left> Variable</th>\n\t\t<th width=140 align=left> Value </th>\n\t</tr>"
    html.write(html_table_headers)


    sensor1 = get_sensor("WSA")
    sensor2 = get_sensor("WDA")
    html_row = "\n\n\t<tr>\n\t\t<td> Wind Speed Avg. (10m) (KT)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> Wind Speed Avg. Direction (Deg.)</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("WSI")
    sensor2 = get_sensor("WDI")
    html_row = "\n\n\t<tr>\n\t\t<td> Wind Speed Inst. (KT)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> Wind Speed Inst. Direction (Deg.)</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("GUST")
    sensor2 = get_sensor("GUSTDIR")
    html_row = "\n\n\t<tr>\n\t\t<td> Wind Gust (KT)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> Wind Gust Direction (Deg.)</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("AT")
    sensor2 = get_sensor("RH")
    html_row = "\n\n\t<tr>\n\t\t<td> Air Temperature (C)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> Relative Humidity (%)</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("ATMAX")
    sensor2 = get_sensor("ATMIN")
    html_row = "\n\n\t<tr>\n\t\t<td> Air Temperature Max (C)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> Air Temperature Min (C)</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("RAIN")
    sensor2 = get_sensor("DP")
    html_row = "\n\n\t<tr>\n\t\t<td> Rain (mm)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> Dew Point (C)</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("BARO")
    sensor2 = get_sensor("QFE")
    html_row = "\n\n\t<tr>\n\t\t<td> Barometric Pressure (hPa)</td>\n\t\t<td>" + str(sensor1) + " </td>\n\t\t<td> QFE</td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)

    sensor1 = get_sensor("QFF")
    sensor2 = get_sensor("QNH")
    html_row = "\n\n\t<tr>\n\t\t<td> QFF (hPa)</td>\n\t\t<td>" + str(sensor1) + "</td>\n\t\t<td> QNH (hPa) </td>\n\t\t<td>" + str(sensor2) + "</td>\n\t</tr>"
    html.write(html_row)


    header = "\n\t</table>\n"
    html.write(header)
    header = '<a href="http://127.0.0.1/analysis" target="_blank">Analysis Page</a> '
    html.write(header)
    sensor1 = get_sensor("BATTERY")
    if debug == 1 :
       print sensor1 

    if (float(sensor1) < 10.0) and (float(sensor1) > -0.1):
      html_row = """<h2 style="color:red;"> Battery Level Critically Low - """ + sensor1 + """ V Contact Swayne @ 416-8831 </h2>"""
      html.write(html_row)
    header = """<h3>Daily Graphs</h3>\n"""
    html.write(header)		
    header = """\n<div style="max-width: 1000px;"> """
    html.write(header)		
    
    header = """<a href="temperature.png"><div class="img1" style="height auto; boder:1px red solid"> \n"""
    html.write(header)		
    header = " <img src=temperature.png>\n </div></a>\n"
    html.write(header)		
    
    header = """<a href="RH_daily2.png"><div class="img2" style="height auto; boder:1px green solid"> \n"""
    html.write(header)		
    header = " <img src=RH_daily2.png>\n </div></a>\n"
    html.write(header)		
    
    header = """<a href="pressure.png"><div class="img3" style="height auto; boder:1px blue solid"> \n"""
    html.write(header)		
    header = " <img src=pressure.png>\n </div></a>\n"
    html.write(header)		
    
    header = """<a href="battery.png"><div class="img4" style="height auto; boder:1px purple solid"> \n"""
    html.write(header)		
    header = " <img src=battery.png>\n </div>\n</div></a>\n"
    html.write(header)		
    
    header = """<h3>Weekly Graphs</h3>\n<div style="max-width: 1000px;"> """
    html.write(header)		
    header = """<a href="AT_weekly2.png"><div class="img1" style="height auto; boder:1px red solid"> \n"""
    html.write(header)		
    header = " <img src=AT_weekly2.png>\n </div></a>\n"
    html.write(header)		
    
    header = """<a href="RH_weekly2.png"><div class="img2" style="height auto; boder:1px green solid"> \n"""
    html.write(header)		
    header = " <img src=RH_weekly2.png>\n </div></a>\n"
    html.write(header)		
    
    header = """<a href="weekly_pressure2.png"><div class="img3" style="height auto; boder:1px blue solid"> \n"""
    html.write(header)		
    header = " <img src=weekly_pressure2.png>\n </div></a>\n"
    html.write(header)		
    
    header = """<a href="weekly_battery.png"><div class="img4" style="height auto; boder:1px purple solid"> \n"""
    html.write(header)		
    header = " <img src=weekly_battery.png>\n </div>\n </div></a>\n"
    html.write(header)		
    
    html_footer = "\n<h3>Beta Version January 2018</h3>\n</body>\n</html>"
    html.write(html_footer)
    html.close()
    print "The AWS Observer file was created!"
    print " " 
    return 0

def Read_Rain(rain_file):
    if os.path.exists(path + 'WRF/'):
        if os.path.exists(path + 'WRF/' + rain_file):
            rain_value = open(path + 'WRF/' + rain_file,'r')
            rain_total = rain_value.readline()
    return rain_total

def Read_USB():
    status = 0
    if os.path.exists(USB_path):
       status = 1
       print "A valid USB has been detected"
    else:
	print "Valid USB found but seems to be not configured of it has becomed corrupt"
	print " "
	print "Trying to configure USB"
#	os.system(' bash /home/data/Basher/setup_USB.sh')
        #Read_USB()
    
    return status

def Write_Rain(rain_file,rain_tips):
    if os.path.exists(path + 'WRF/'):
        if os.path.exists(path + 'WRF/' + rain_file):
            rain_value = open(path + 'WRF/' + rain_file,'w')
            rain_value.write(str(rain_tips))
    return 0
     
def Write_to_WRF(wrf_filename, value):
    if os.path.exists(path + 'WRF/'):
        if os.path.exists(path + 'WRF/' + wrf_filename):
            wrf = open(path + 'WRF/'+ wrf_filename,'a')
            wrf.write(timestamp)
            wrf.write('       ')
            wrf.write(value)
            wrf.write("\n")
        else:
            wrf = open(path + 'WRF/'+ wrf_filename,'w')
            wrf.write(timestamp)
            wrf.write('       ')
            wrf.write(value)
            wrf.write("\n")
            
    else:
        os.mkdir(path + 'WRF/')
        wrf = open(path + 'WRF/'+ wrf_filename,'w')
        wrf.write(timestamp)
        wrf.write('       ')
        wrf.write(value)
        wrf.write("\n")
    return 0

def Write_to_USB(sensor_name , sensor_val):
    sensor_list = ['AT','ATMIN','ATMAX','BARO','BATTERY','DP','GUST','GUSTDIR','LWBASIC','LW','QFE','QFF','QNH','RAIN','RH','SOLARV','TB','VWC','WDI','WDA','WSA','WSI']
    print sensor_list
    if sensor_name in sensor_list:
      if os.path.exists(USB_path + sensor_name):
          if os.path.exists(USB_path + sensor_name + '/' + date + "_" + hour + '.txt'):
            f = open(USB_path + sensor_name + '/' + date + "_" + hour + '.txt','a')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")

          else:
            f = open( USB_path + sensor_name + '/' + date + '_' + hour + '.txt','w')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")
        
      else:
        os.mkdir(USB_path + sensor_name)
        f = open( USB_path + sensor_name + '/' + date + '_' + hour + '.txt','w')
        f.write(timestamp)
        f.write('    ')
        f.write(sensor_val)
        f.write("\n")
      f.close()
    
      if os.path.exists(USB_path + 'Daily/'):
          if os.path.exists(USB_path  +'Daily/' + sensor_name + '_daily.dat'):
            d = open(USB_path + 'Daily/' + sensor_name + '_daily.dat','a')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
          else:
            d = open(USB_path + 'Daily/' + sensor_name + '_daily.dat','w')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
      else:
          os.mkdir(USB_path + 'Daily/')
          d = open(USB_path + 'Daily/' + sensor_name + '_daily.dat','w')
          d.write(timestamp)
          d.write('    ')
          d.write(sensor_val)
          d.write("\n")
      d.close()

      if os.path.exists(USB_path + 'Weekly/'):
          if os.path.exists(USB_path  +'Weekly/' + sensor_name + '_weekly.dat'):
            d = open(USB_path + 'Weekly/' + sensor_name + '_weekly.dat','a')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
            d.close()
            d = open(USB_path + 'Weekly/' + sensor_name + '_weekly.dat','r')
            lines = len(d.readlines())
            if lines > 18720:
                d.close()
                os.system('cp ' + USB_path + 'Weekly/' + sensor_name + '_weekly.dat '+ USB_path + 'Weekly/' + sensor_name + '_weekly_temp.dat')
                d = open(USB_path + 'Weekly/' + sensor_name + '_weekly.dat','w')
                temp_file = open(path + 'Weekly/' + sensor_name + '_weekly_temp.dat','r')
                temp_file.readline()
                for x in range (0,(lines-1)):
                    d.write(temp_file.readline())
                temp_file.close()
                d.close()
                os.system('rm ' + USB_path + 'Weekly/' + sensor_name + '_weekly_temp.dat')
          else:
            d = open(USB_path + 'Weekly/' + sensor_name + '_weekly.dat','w')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
            d.close()
      else:
        os.mkdir(USB_path + 'Weekly/')
        d = open(USB_path + 'Weekly/' + sensor_name + '_weekly.dat','w')
        d.write(timestamp)
        d.write('    ')
        d.write(sensor_val)
        d.write("\n")
        d.close()
    else:
        if os.path.exists(USB_path + 'Garbage/'):
          if os.path.exists(USB_path + 'Garbage/trash.txt'):
            f = open(USB_path + 'Garbage/trash.txt','a')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")

          else:
            f = open(USB_path + 'Garbage/trash.txt','w')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")
        else:
            os.mkdir(USB_path+'Garbage/')
            f = open(USB_path + 'Garbage/trash.txt','w')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")
    return 0

def Write_to_file(sensor_name , sensor_val):
    sensor_list = ['AT','ATMIN','ATMAX','BARO','BATTERY','DP','GUST','GUSTDIR','LWBASIC','LW','QFE','QFF','QNH','RAIN','RH','SOLARV','TB','VWC','WDI','WDA','WSA','WSI','SP','ST','SM','EC']
    #print sensor_list
    if sensor_name in sensor_list:
      if os.path.exists(path + sensor_name):
          if os.path.exists(path + sensor_name + '/' + date + "_" + hour + '.txt'):
            f = open(path + sensor_name + '/' + date + "_" + hour + '.txt','a')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")

          else:
            f = open( path + sensor_name + '/' + date + '_' + hour + '.txt','w')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")
        
      else:
        os.mkdir(path + sensor_name)
        f = open( path + sensor_name + '/' + date + '_' + hour + '.txt','w')
        f.write(timestamp)
        f.write('    ')
        f.write(sensor_val)
        f.write("\n")
      f.close()
    
      if os.path.exists(path + 'Daily/'):
          if os.path.exists(path  +'Daily/' + sensor_name + '_daily.dat'):
            d = open(path + 'Daily/' + sensor_name + '_daily.dat','a')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
          else:
            d = open(path + 'Daily/' + sensor_name + '_daily.dat','w')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
      else:
          os.mkdir(path + 'Daily/')
          d = open(path + 'Daily/' + sensor_name + '_daily.dat','w')
          d.write(timestamp)
          d.write('    ')
          d.write(sensor_val)
          d.write("\n")
      d.close()

      if os.path.exists(path + 'Weekly/'):
          if os.path.exists(path  +'Weekly/' + sensor_name + '_weekly.dat'):
            d = open(path + 'Weekly/' + sensor_name + '_weekly.dat','a')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
            d.close()
            d = open(path + 'Weekly/' + sensor_name + '_weekly.dat','r')
            lines = len(d.readlines())
            if lines > 18720:
                d.close()
                os.system('cp ' + path + 'Weekly/' + sensor_name + '_weekly.dat '+ path + 'Weekly/' + sensor_name + '_weekly_temp.dat')
                d = open(path + 'Weekly/' + sensor_name + '_weekly.dat','w')
                temp_file = open(path + 'Weekly/' + sensor_name + '_weekly_temp.dat','r')
                temp_file.readline()
                for x in range (0,(lines-1)):
                    d.write(temp_file.readline())
                temp_file.close()
                d.close()
                os.system('rm ' + path + 'Weekly/' + sensor_name + '_weekly_temp.dat')
          else:
            d = open(path + 'Weekly/' + sensor_name + '_weekly.dat','w')
            d.write(timestamp)
            d.write('    ')
            d.write(sensor_val)
            d.write("\n")
            d.close()
      else:
        os.mkdir(path + 'Weekly/')
        d = open(path + 'Weekly/' + sensor_name + '_weekly.dat','w')
        d.write(timestamp)
        d.write('    ')
        d.write(sensor_val)
        d.write("\n")
        d.close()
    else:
        if os.path.exists(path + 'Garbage/'):
          if os.path.exists(path + 'Garbage/trash.txt'):
            f = open(path + 'Garbage/trash.txt','a')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")

          else:
            f = open(path + 'Garbage/trash.txt','w')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")
        else:
            os.mkdir(path+'Garbage/')
            f = open(path + 'Garbage/trash.txt','w')
            f.write(timestamp)
            f.write('    ')
            f.write(sensor_val)
            f.write("\n")
    return 0

def FTP_File_Send():
    s = ftplib.FTP('FTP_ADDRESS','USER','PASSWORD')
    time.sleep(5)
    s.cwd('mforde')
    s.cwd('ERC_Graphs')
    try:
        f = open(path +'W/temperature.png','rb')
        s.storbinary('STOR Temperature.png' ,f)
        print 'sending file to FTP Server...'
        time.sleep(2)
        print 'file sent'
        s.close()
        f.close()
    except:
        print 'File not found'
        s.close()

def WRF_FTP_File_Send(wrf_file):
    s = ftplib.FTP('FTP_ADDRESS','USER','PASSWORD')  # REDACTED: real host/user/password removed
    time.sleep(5)
    s.cwd('Marvin')
    s.cwd('wrfout')
    try:
        f = open(path +'WRF/'+ wrf_file,'rb')
        s.storbinary('STOR ' + wrf_file ,f)
        print 'sending WRF file to hydro FTP Server...'
        time.sleep(2)
        print 'file sent'
        s.close()
        f.close()
    except:
        print 'File not found'
        s.close()

os.system('date')
debug = 0        
g = Gnuplot.Gnuplot(debug=0)
config = ConfigParser.ConfigParser()
config.read('/home/data/Sutron_Linux/Script/sutron_linux.ini')

path = config.get("Program","path")
#path = '/home/data/Sutron_Linux/'
USB_path = '/media/USB_2Gb/Sutron_Linux/'

#station_file = open('/home/data/Basher/station.txt','r')
#stationname = station_file.readline()
stationname = config.get("Program","stationname")
print stationname

html_maker = config.getint("Program","htmlmaker")
FTP_maker = config.getint("Program","FTPmaker")
FTP_send = config.getint("Program","FTPSend")
SFTP_send = 0
#Controlled by the 10 min interval below
Database_send = 0
debug = config.getint("Program","debug")
WRF_Send = 0
WRF_FTP = 0
WRF_00Z = 0
WRF_06Z = 0
WRF_12Z = 0
multiplier = config.getint("Program","multiplier")
#rain_tip_total = Read_Rain('rain.txt')

#USB_status = Read_USB()
#print "the current rain total is " + rain_tip_total

baudrate = config.getint("COMS","baud")
port = config.get("COMS","port")
timeout = config.getint("COMS","timeout")

ser = serial.Serial(port,baudrate)
print ser.isOpen()

ser.timeout = timeout
ser_check = False


try:
      if ser.isOpen() == True:
         ser_check = ser.isOpen()
         print " Serial Port open "
         print ser_check
   
   
except:
  print "Could not open serial port!:", sys.exc_info()[0]
 
hour = strftime("%H",localtime())
hours = strftime("%H",localtime())
minute = strftime("%M",localtime())
minutes = strftime("%M",localtime())
date = strftime("%d%b%Y",localtime())
day = strftime("%d",localtime())
month = strftime("%m",localtime())
year = strftime("%Y",localtime())
yr = strftime("%y",localtime())
timestamp = strftime("%d%b%Y   %H:%M:%S ",localtime())
format= strftime("%Y%m%d",localtime())
MOC_date = strftime("%y%m%d",localtime())
MOC_time = strftime("%H%M%S",localtime())
ks_time = strftime("%Y%m%d%H%M",localtime())
print ks_time
currenttime = hour + minute
#print minutes
if minutes == '00':
   SFTP_send = config.getint("Program","SFTPsend")
   Database_send = config.getint("Program","DatabaseSend")
if minutes == '10':
   SFTP_send = config.getint("Program","SFTPsend")
   Database_send = config.getint("Program","DatabaseSend")
   WRF_00Z = 0
if minutes == '20':
   SFTP_send = config.getint("Program","SFTPsend")
   Database_send = config.getint("Program","DatabaseSend")
   WRF_00Z = 0
if minutes == '30':
   SFTP_send = config.getint("Program","SFTPsend")
   Database_send = config.getint("Program","DatabaseSend")
   WRF_00Z = 0
if minutes == '40':
   SFTP_send = config.getint("Program","SFTPsend")
   Database_send = config.getint("Program","DatabaseSend")
   WRF_00Z = 0
if minutes == '50':
   SFTP_send = config.getint("Program","SFTPsend")
   Database_send = config.getint("Program","DatabaseSend")
   WRF_00Z = 0
if currenttime == '0000':
    os.system('rm ' + path + 'Daily/*.dat')
    
if debug == 1:
   print hour
   print minute
   print date
   print year
ser.flushInput
ser.flushOutput
ser.flush
ser.write("\r")
ser.write("\n")
record = ''
inbtye = ''
inbyte = ser.read(5000)

if debug == 1:
   print inbyte
   print len(inbyte)
successful = False
while not successful: 
    record = ''
    inbtye = ''
    ser.write("show /tag /c")
    ser.write("\r")
    ser.write("\n")
    inbyte = ser.read(5000)
    count = inbyte.splitlines()
    if len(count) <> 0:
        successful = True
        
print inbyte
Write_to_html = ''
for x in range(1,(len(count) -1)):
    if debug ==1 :
       print count[x]
    sensor = ''
    value =''
    quality = ''

    a = 0
    while count[x][a] <> ' ':
        sensor = sensor + count[x][a]
        a = a + 1
    while count[x][a] == ' ':
        a = a + 1
    while count[x][a] <> ' ':
        value = value + count[x][a]
        a = a + 1
    while count[x][a] == ' ':
        a = a + 1
    while count[x][a] <> ' ':
        quality = quality + count[x][a]
        a = a + 1
    if ((sensor == 'RAIN') and (WRF_00Z == 1)):
        print value
        print rain_tip_total
        print "in the rain"
        rain_tip_total = float(rain_tip_total) + float(value)
        Write_Rain('rain.txt',str(rain_tip_total))
	#Write_to_WRF('WRF_06Z.dat',str(rain_tip_total))
	#Write_to_WRF('WRF_12Z.dat',str(rain_tip_total))
    if ((sensor == 'RAIN') and (minutes == '00')and (WRF_00Z==1)):
        Write_to_WRF('WRF_00Z.dat',str(rain_tip_total))
        Write_to_WRF('WRF_06Z.dat',str(rain_tip_total))
        Write_to_WRF('WRF_12Z.dat',str(rain_tip_total))
        rain_tip_total = 0.0
        Write_Rain('rain.txt',str(rain_tip_total)) 
         
        
    sensor_record = sensor + '  ' + value + ' ' + quality
    Write_to_html = Write_to_html + sensor + ',' + value + ','
    Write_to_file(sensor,sensor_record)
    #print sensor + '  ' + value + ' ' + quality


#MOC
# Met Observation Console parameters 
get_moc_send = config.getint("Program","MOCsend")
try:
 if get_moc_send == 1:
   print "MCO outout enabled"
   MOC_IP = config.get("MOC","ip")
   MOC_PORT = config.getint("MOC","port")
   print  
   clientsocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
   clientsocket.connect((MOC_IP,MOC_PORT))
   clientsocket.send("connection established..\r\n")
   MOC_variables = config.get("MOC","variables")
   #print
   #print MOC_date
   #print MOC_time
   #print MOC_variables
   MOC_string = '(S:' + stationname + ';D:' + MOC_date + ';T:' + MOC_time
   MOC_list = Write_to_html
   MOC_list = MOC_list[0:(len(MOC_list)-1)]
   #print MOC_list
   parsed_MOC = MOC_list.split(",")
   for j in range(0,len(parsed_MOC),2):
      if parsed_MOC[j] in MOC_variables:
         MOC_ref = config.get("MOC",parsed_MOC[j])
         MOC_string = MOC_string + ';' + MOC_ref + ':' + parsed_MOC[j+1]
   MOC_string = MOC_string + ')'
   print " MOC Output String"
   print
   print MOC_string
   clientsocket.send(MOC_string)
   clientsocket.close()      
except:
 print "Could not reach MOC IP OR Port"
#Write HTML
data_split = Write_to_html.split(",")
if html_maker == 1:
    Create_HTML(Write_to_html)
#SFTP_send = 1
if SFTP_send == 1:
   if FTP_maker == 1:
      print " Making FTP file for transfer"
      Create_FTP(data_split)
   SFTP_send = 0
#send to Database 
if Database_send == 1:
   Database_send = 0	    

# Plot Daily Graphs
    
print "Generating graphs"
print " "
g('cd "/home/data/Sutron_Linux/Daily/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Daily/Daily_Images/temperature.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Daily Temperature and Dew Point Graph"')
g('set key noautotitles')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [10.0:40.0]')
#g('set yrange [10.0:30.0]')
g('set ylabel " Temperature - C"')
g('set datafile missing "NaN"')
g('plot "AT_daily.dat" using 1:($4) with lines title "Temperature","DP_daily.dat" using 1:($4) with lines title "Dew Point"')
print "01  of  10 completed"
g('cd "/home/data/Sutron_Linux/Daily/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Daily/Daily_Images/RH_daily2.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Daily Relative Humidity Graph"')
g('set key noautotitles')
g('set key bottom right')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [40.0:100.0]')
g('set ylabel " Percentage - %"')
g('set datafile missing "NaN"')
g('plot "RH_daily.dat" using 1:($4) with lines title "Relative Humidity"')
print "02  of  10 completed"

g('cd "/home/data/Sutron_Linux/Daily/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Daily/Daily_Images/AT_max_min2.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Daily Temperature Maximums and Minimum Temperatures Graph"')
g('set key noautotitles')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [10.0:40.0]')
g('set ylabel " Temperature"')
g('set datafile missing "NaN"')
g('plot "ATMAX_daily.dat" using 1:($4) with lines title "Max temp", "ATMIN_daily.dat" using 1:($4) with lines title "Min temp "')
print "03  of  10 completed"

g('cd "/home/data/Sutron_Linux/Daily/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Daily/Daily_Images/daily_pressure.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Daily Pressure Graph"')
g('set key noautotitles')
g('set key top right')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [990.0:1040.0]')
g('set ylabel " Pressure - mb"')
g('set datafile missing "NaN"')
g('plot "BARO_daily.dat" using 1:($4) with lines title "Baro", "QFE_daily.dat" using 1:($4) with lines title "QFE ","QFF_daily.dat" using 1:($4) with lines title "QFF ","QNH_daily.dat" using 1:($4) with lines title "QNH "')
print "04  of  10 completed"

g('cd "/home/data/Sutron_Linux/Daily/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Daily/Daily_Images/battery.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Battery Voltage Graph"')
g('set key noautotitles')
g('set key bottom right')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [5.0:15.0]')
g('set ylabel " Voltage - V"')
g('set datafile missing "NaN"')
g('plot "BATTERY_daily.dat" using 1:($4) with lines title "Battery Voltage"')
print "05  of  10 completed"

#Weekly Images

os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/AT_weekly.dat > /home/data/Sutron_Linux/Weekly/AT_temp.dat')
os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/DP_weekly.dat > /home/data/Sutron_Linux/Weekly/DP_temp.dat')
g('cd "/home/data/Sutron_Linux/Weekly/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Weekly/Weekly_Images/AT_weekly2.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Weekly Temperature and Dew Point Graph"')
g('set key noautotitles')
g('set key top right')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [10.0:40.0]')
g('set ylabel " Temperature - C"')
g('set datafile missing "NaN"')
g('plot "AT_temp.dat" using 1:($4) with lines title "Temperature", "DP_temp.dat" using 1:($4) with lines title "Dew Point"')
print "06  of  10 completed"
#os.system('rm AT_temp.dat')
#os.system('rm DP_temp.dat')

g('cd "/home/data/Sutron_Linux/Weekly/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Weekly/Weekly_Images/AT_max_min2.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Daily Temperature Maximums and Minimum Temperatures Graph"')
g('set key noautotitles')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [20.0:40.0]')
g('set ylabel " Temperature"')
g('set datafile missing "NaN"')
g('plot "ATMAX_weekly.dat" using 1:($4) with lines title "Max temp", "ATMIN_weekly.dat" using 1:($4) with lines title "Min temp "')
print "07  of  10 completed"

os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/BARO_weekly.dat > /home/data/Sutron_Linux/Weekly/BARO_temp.dat')
os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/QFE_weekly.dat > /home/data/Sutron_Linux/Weekly/QFE_temp.dat')
os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/QFF_weekly.dat > /home/data/Sutron_Linux/Weekly/QFF_temp.dat')
os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/QNH_weekly.dat > /home/data/Sutron_Linux/Weekly/QNH_temp.dat')

g('cd "/home/data/Sutron_Linux/Weekly/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Weekly/Weekly_Images/weekly_pressure2.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Weekly Pressure Graph"')
g('set key noautotitles')
g('set key top right')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [990.0:1040.0]')
g('set ylabel " Pressure - mb"')
g('set datafile missing "NaN"')
g('plot "BARO_temp.dat" using 1:($4) with lines title "Baro", "QFE_temp.dat" using 1:($4) with lines title "QFE ","QFF_temp.dat" using 1:($4) with lines title "QFF ","QNH_temp.dat" using 1:($4) with lines title "QNH "')
print "08  of  10 completed"

os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/BATTERY_weekly.dat > /home/data/Sutron_Linux/Weekly/BATTERY_temp.dat')

g('cd "/home/data/Sutron_Linux/Weekly/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Weekly/Weekly_Images/weekly_battery.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Battery Voltage Graph"')
g('set key noautotitles')
g('set key bottom right')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [5.0:15.0]')
g('set ylabel " Voltage - V"')
g('set datafile missing "NaN"')
g('plot "BATTERY_temp.dat" using 1:($4) with lines title "Battery Voltage"')
print "09  of  10 completed"

os.system('tail -n 5040 /home/data/Sutron_Linux/Weekly/RH_weekly.dat > /home/data/Sutron_Linux/Weekly/RH_temp.dat')

g('cd "/home/data/Sutron_Linux/Weekly/"')
g('set xdata time')
g('set terminal png size 800,400')
g('set timefmt "%d%b%Y   %H:%M:%S"')
g('set output "/home/data/Sutron_Linux/Weekly/Weekly_Images/RH_weekly2.png"')
g('set format x "%H:%M\\n%d%b"')
g('set title " Weekly Relative Humidity Graph"')
g('set key noautotitles')
g('set grid')
g('set xlabel "Time\\nDate"')
g('set yrange [40.0:100.0]')
g('set ylabel " Percentage - %"')
g('set datafile missing "NaN"')
g('plot "RH_temp.dat" using 1:($4) with lines title "Relative Humidity"')
print "10  of  10 completed"

#os.system(' cp ' + path + 'Daily/Daily_Images/*.png /var/www/html/AWS')

print "Copying updated files to web hosting folder(s)"
os.system('cp ' + path + 'Daily/Daily_Images/RH_daily2.png /var/www/html/AWS/RH_daily2.png')
time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/RH_daily2.png /var/www/html/AWS/RH_daily2.png')
#time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/temperature.png /var/www/html/AWS/temperature.png')
time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/temperature.png /var/www/html/AWS/temperature.png')
#time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/daily_pressure.png /var/www/html/AWS/pressure.png')
time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/daily_pressure.png /var/www/html/AWS/pressure.png')
#time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/battery.png /var/www/html/AWS/battery.png')
time.sleep(1)
os.system('cp ' + path + 'Daily/Daily_Images/battery.png /var/www/html/AWS/battery.png')
#time.sleep(1)
#os.system('cp ' + path + 'Weekly/Weekly_Images/*.png /var/www/html/AWS')
#os.system('cp ' + path + 'Weekly/Weekly_Images/*.png /var/www/html/AWS')

os.system('cp ' + path + 'Weekly/Weekly_Images/AT_weekly2.png /var/www/html/AWS')
os.system('cp ' + path + 'Weekly/Weekly_Images/weekly_battery.png /var/www/html/AWS')
os.system('cp ' + path + 'Weekly/Weekly_Images/weekly_pressure2.png /var/www/html/AWS')
os.system('cp ' + path + 'Weekly/Weekly_Images/RH_weekly2.png /var/www/html/AWS')
#os.system('cp ' + path + 'Daily/Daily_Images/*.png /var/www/html/AWS')
#os.system('cp ' + path + 'Daily/Daily_Images/*.png /var/www/html/AWS')
#time.sleep(1)
#os.system('cp ' + path + 'Weekly/Weekly_Images/*.png /var/www/html/AWS')
#time.sleep(1)
os.system('cp ' + path + 'HTML/index.html /var/www/html/AWS/')
os.system('cp ' + path + 'HTML/index.html /var/www/html/AWS/')
time.sleep(1)

if FTP_send == 1:
   FTP_File_Send()

#Sends WRF Files to FTP Server
if WRF_FTP == 1:
   WRF_FTP_File_Send('WRF_00Z.dat')
   WRF_FTP_File_Send('WRF_06Z.dat')
   WRF_FTP_File_Send('WRF_12Z.dat')

#closes serial port
print ser_check 
if ser_check == True:
   ser.close()
   ser_check = ser.isOpen()
   if ser_check == False:
      print "Serial Port Closed"
      print ser_check

os.system('date')
os.system('echo " "')
