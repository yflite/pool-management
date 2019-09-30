import Web3 from 'web3'

export function toEther(value) {
  return Web3.utils.fromWei(value)
}

export function toWei(value) {
  return Web3.utils.toWei(value, 'ether')
}