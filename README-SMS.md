# Background
This project uses AWS Simple Notification Service to push SMS to mobile devices.

To use this service, you will need an AWS account.
The first 100 messages sent in the month are free, and additional SMS pushes
are $0.00645 for all networks.

For a working backup system, expect to receive around 4-5 texts per month
containing the weekly summary of backups. If you believe you will receive more
than 100 messages, consider paying for a higher tier service from AWS.

# Configuring SMS notifications

## IMPORTANT NOTE:
If you are planning on sending messages to only 1 phone number, skip steps 2
and 3. You will provide a single phone number in the configuration file in
step 4. 

## Step 1: Initializing Credentials

## Step 2: Create a SNS topic
This can be done from the SNS dashboard accessed from https://console.aws.amazon.com/sns/v2.
Create a topic with an appropriate topic name and display name. This will
generate Amazon Resource Name (ARN) which you can view under Topics.

## Step 3: Create subscriptions
For each phone number you would like to receive messages, you need to create a
subscription to the topic you have created. You can do so by going to the
Subscriptions page and creating subscriptions to the topic by using the topic
ARN. The protocol should be sms.

## Step 4: Configure the config files
- backup.ini under 'notifications' should contain a 'sms_to' field with the
topic ARN OR a single phone number if you only want to send messages to one number
**The phone number or ARN need to be surrounded by "" (double quotes) so they
evaluate to strings**
- the initialization file also should include the sms region, access key, and secret key
**The program will not configure SMS notifications without all 4
configurations specified**
