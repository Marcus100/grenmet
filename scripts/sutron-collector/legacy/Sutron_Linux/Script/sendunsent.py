#!/usr/bin/python
#12 March 2020 - Created to send unsent files to Kaleidoscope Server
"""
This script looks for any unsent KaleidoScope Files and sends them to the server

"""
import requests,os
from datetime import datetime as dt
import time
import KaleidoScope as ks

def start():
   resp = False
   rsp_lst = []
   path = "/home/data/Sutron_Linux/Script/"
   if os.path.exists(os.path.join(path,"unsent_server1.txt")):
      with open(os.path.join(path,"unsent_server1.txt"),"r") as f:
         for line in f:
            #print line
            try:
               resp,srv_t = ks.SendUnsent(line.strip())
               print resp
               if resp == "Invalid time format detected. Please consult your advisor.":
                  rsp_lst.append("F")
               else:
                  rsp_lst.append("T")
            except:
               pass
            if (resp != False):
              time.sleep(1) 
      print rsp_lst
      if "F" in rsp_lst:
         with open(os.path.join(path,"temp.txt"),"w") as temp:
            with open(os.path.join(path,"unsent_server1.txt"),"r") as f:
               for truth in rst_lst:
                  if truth:
                     f.readline()
                  else:
                     temp.write(f.readline())
         os.rename(os.path.join(path,"temp.txt"),os.path.join(path,"unsent_server1.txt"))

      else:
         os.remove(os.path.join(path,"unsent_server1.txt"))
        
   else:
     print "Seems as though all files have been as scheduled for the {} hour on {}.".format(dt.now().strftime("%H"),dt.now().strftime("%Y-%m-%d"))

if __name__ == "__main__":
   start()
