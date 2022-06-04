import got from 'got';



function main(args) {
    let name = args.name || 'stranger'
    let greeting = 'Hello ' + name + '!'
    console.log(greeting)

    const {data} = await got.post('https://google.com', {
        json: {
        }
}   ).json();
    return {"body": data}
  }

exports.main = main