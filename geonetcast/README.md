# 🛰️ GNC-A Training Resources 🌎

In this repository, you will find all the scripts used during the training.

![banner_github](https://github.com/user-attachments/assets/7c88ba40-73a9-4af5-af78-177fc478fbdf)

- **GOES** directory: Example scripts for the 1st and 2nd days

- **NWP** directory: Example scripts for the 3rd and 4th days

- **Animation** directory: Example script for the 5th day

- **Miscellaneous** directory: Example scripts for the 5th and 6th days

- **Google Colab Notebooks** directory: Google COLAB Notebooks to execute Python scripts directly in the cloud

- **GNC-A Hardware and Software** directory: Scripts and commands related to the FAZZT Client and DVB-S2 Receiver

## Shared data (not in git)

The Natural Earth admin-1 boundary shapefiles used by the plotting scripts
(`shared/ne_10m_admin_1_states_provinces.*`, ~36 MB) are gitignored. Restore
them with:

```bash
curl -L -o /tmp/ne_admin1.zip \
  https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip
unzip -o /tmp/ne_admin1.zip -d geonetcast/shared \
  ne_10m_admin_1_states_provinces.shp \
  ne_10m_admin_1_states_provinces.dbf \
  ne_10m_admin_1_states_provinces.shx
```

The Google Colab notebooks are committed **with outputs stripped** (the
rendered satellite imagery made them 10–57 MB each). Re-run them to regenerate
outputs; the originals with outputs survive in git history at commit `4c93c9d`.
