#!/usr/bin/env bash
sudo apt-get update

# nodejs
sudo apt-get install git -y
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install nodejs -y
sudo npm install pkg -g

# force startup folder to vagrant project
echo "cd /vagrant/src" >> /home/vagrant/.bashrc

# set hostname, makes console easier to identify
sudo echo "httpexec" > /etc/hostname
sudo echo "127.0.0.1 httpexec" >> /etc/hosts
