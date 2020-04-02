#!/usr/bin/env bash
sudo apt-get update

# nodejs
sudo apt-get install git -y
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install nodejs -y
sudo npm install pkg -g

# docker
wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/containerd.io_1.2.6-3_amd64.deb
wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce-cli_19.03.5~3-0~ubuntu-bionic_amd64.deb
wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce_19.03.5~3-0~ubuntu-bionic_amd64.deb
sudo dpkg -i docker-ce-cli_19.03.5~3-0~ubuntu-bionic_amd64.deb
sudo dpkg -i containerd.io_1.2.6-3_amd64.deb
sudo dpkg -i docker-ce_19.03.5~3-0~ubuntu-bionic_amd64.deb

sudo curl -L "https://github.com/docker/compose/releases/download/1.25.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo usermod -aG docker vagrant

# force startup folder to vagrant project
echo "cd /vagrant" >> /home/vagrant/.bashrc

# set hostname, makes console easier to identify
sudo echo "buildbroker" > /etc/hostname
sudo echo "127.0.0.1 buildbroker" >> /etc/hosts
