import { DynamoDB } from 'aws-sdk'

const dynamoDb = new DynamoDB()

export default (phoneNumber, vanities) =>
  new Promise((resolve, reject) =>
    dynamoDb.putItem(
      {
        Item: {
          phoneNumber: {
            N: phoneNumber,
          },
          vanities: {
            SS: vanities,
          },
        },
        ReturnConsumedCapacity: 'TOTAL',
        TableName: 'vanityNumbers',
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      }
    )
  )
