'use strict'
import got from 'got'
import { pathOr, path, isEmpty, compose, not, flatten, pluck } from 'ramda'
import { DynamoDB } from 'aws-sdk'
import insertVanities from './insertVanities'

const dynamoDb = new DynamoDB()

const NUM_MAP = {
  '2': ['A', 'B', 'C'],
  '3': ['D', 'E', 'F'],
  '4': ['G', 'H', 'I'],
  '5': ['J', 'K', 'L'],
  '6': ['M', 'N', 'O'],
  '7': ['P', 'Q', 'R', 'S'],
  '8': ['T', 'U', 'V'],
  '9': ['W', 'X', 'Y', 'Z'],
}

export const createVanityNumbers = async (event, context, callback) => {
  console.log(JSON.stringify(event, null, 2))
  const phoneNumber = pathOr(
    '',
    ['Details', 'ContactData', 'CustomerEndpoint', 'Address'],
    event
  ).replace('+', '')

  const existingVanities = await new Promise((resolve, reject) =>
    dynamoDb.getItem(
      {
        Key: {
          phoneNumber: {
            N: phoneNumber,
          },
        },
        TableName: 'vanityNumbers',
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      }
    )
  )
  if (!isEmpty(existingVanities)) {
    return callback(null, path(['Item', 'vanities', 'SS'], existingVanities))
  }
  const areaCode = phoneNumber.slice(0, phoneNumber.length - 7)
  const vanityNumbers = phoneNumber.slice(-7)
  const options = generateWordQueries(vanityNumbers)
  const vanityWords = await getVanityWords(options)

  const vanities = vanityWords.map(({ numbers, word }) => {
    const numberIndex = vanityNumbers.indexOf(numbers)
    const phoneNumberArray = vanityNumbers.split('')
    phoneNumberArray.splice(numberIndex, word.length, word)
    return areaCode.split('').concat(phoneNumberArray).join(' ')
  })

  await insertVanities(phoneNumber, vanities)
  return callback(null, vanities)
}

const generateWordQueries = (phoneNumber) => {
  if (typeof phoneNumber !== 'string')
    throw Error(
      `Expected string in parseNumbersWithLetters. Got: ${typeof phoneNumber}`
    )
  if (isEmpty(phoneNumber)) return []
  const validNumbers = Object.keys(NUM_MAP)
  return phoneNumber
    .split('')
    .reduce(
      (agg, number) => {
        if (!validNumbers.includes(number)) agg.push('')
        else agg[agg.length - 1] += number
        return agg
      },
      ['']
    )
    .filter(compose(not, isEmpty))
    .map((number) => {
      const output = []
      for (let i = 0; i < number.length - 1; i++) {
        output.push(generateQueries(number.slice(i)))
      }
      return output
    })
    .flat(Infinity)
    .sort((a, b) => path(['query', 'length'], b) - path(['query', 'length'], a))
}

let count = 0
const getVanityWords = async (options) => {
  let output = []
  for (let i in options) {
    if (output.length >= 5) break
    const possibilities = await got(
      `https://api.datamuse.com/words?sp=${options[i].query}`
    )
      .then((res) => JSON.parse(res.body))
      .then(pluck(['word']))
    output = output.concat(
      options[i].numbers
        .split('')
        .reduce((agg, number, index) => {
          const numberOptions = NUM_MAP[number]
          return agg.filter((option) =>
            numberOptions.includes(option[index].toUpperCase())
          )
        }, possibilities)
        .map((word) => ({ numbers: options[i].numbers, word }))
    )
  }
  return output.slice(0, 5)
}

const generateQueries = (numbers, output = { numbers: '', query: '' }) => {
  if (output.query.length === 2)
    return {
      numbers: `${output.numbers}${numbers}`,
      query: `${output.query}${numbers.replace(/./g, '?')}`,
    }
  const num = numbers[0]
  return NUM_MAP[num].map((letter) =>
    generateQueries(numbers.slice(1), {
      numbers: `${output.numbers}${num}`,
      query: `${output.query}${letter}`,
    })
  )
}
