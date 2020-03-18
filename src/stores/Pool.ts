import RootStore from 'stores/Root';
import { action, observable } from 'mobx';
import { fetchPublicPools } from 'provider/subgraph';
import {Pool, PoolToken} from 'types';
import { BigNumber } from '../utils/bignumber';
import {bnum, fromPercentage, POOL_TOKENS_DECIMALS, printPool, scale} from '../utils/helpers';
import { Web3ReactContextInterface } from '@web3-react/core/dist/types';
import { ContractTypes } from './Provider';

interface PoolData {
    blockLastFetched: number;
    data: Pool;
}

interface PoolMap {
    [index: string]: PoolData;
}

export default class PoolStore {
    @observable pools: PoolMap;
    @observable poolsLoaded: boolean;
    rootStore: RootStore;

    constructor(rootStore) {
        this.rootStore = rootStore;
        this.pools = {} as PoolMap;
    }

    @action async fetchPublicPools() {
        const { providerStore, contractMetadataStore } = this.rootStore;
        // The subgraph and local block could be out of sync
        const currentBlock = providerStore.getCurrentBlockNumber();

        console.debug('[fetchPublicPools] Fetch pools');
        const pools = await fetchPublicPools(contractMetadataStore.tokenIndex);

        pools.forEach(pool => {
            printPool(pool);
            this.setPool(pool.address, pool, currentBlock);
        });
        this.poolsLoaded = true;

        console.debug('[fetchPublicPools] Pools fetched & stored');
    }

    @action private setPool(
        poolAddress: string,
        newPool: Pool,
        blockFetched: number
    ) {
        const poolData = this.getPoolData(poolAddress);
        // If already exists, only overwrite if stale
        if (poolData) {
            if (blockFetched > poolData.blockLastFetched) {
                this.pools[poolAddress] = {
                    blockLastFetched: blockFetched,
                    data: newPool,
                };
            }
        } else {
            this.pools[poolAddress] = {
                blockLastFetched: blockFetched,
                data: newPool,
            };
        }
    }

    getPoolToken(poolAddress: string, tokenAddress: string): PoolToken {
        return this.getPool(poolAddress).tokens.find(token => token.address === tokenAddress
        );
    }

    getPoolTokenBalance(poolAddress: string, tokenAddress: string): BigNumber {
        const token = this.getPool(poolAddress).tokens.find(token => token.address === tokenAddress);
        if (!token) {
            throw new Error(`Token ${tokenAddress} not found in pool ${poolAddress}`);
        }
        return token.balance;
    }

    getUserLiquidityContribution(poolAddress: string, tokenAddress: string, account: string): BigNumber {
        const userProportion = this.getUserShareProportion(poolAddress, account);
        const poolTokenBalance = this.getPoolTokenBalance(poolAddress, tokenAddress);

        console.log('getUserLiquidityContribution', {
            userProportion: userProportion.toString(),
            poolTokenBalance: poolTokenBalance.toString(),
            userLiquidityContribution: poolTokenBalance.times(userProportion).toString()
        });
        return poolTokenBalance.times(userProportion);
    }

    getUserShare(poolAddress: string, account: string): BigNumber | undefined{
        const {tokenStore} = this.rootStore;
        const userShare = tokenStore.getBalance(poolAddress, account);

        if (userShare) {
            return userShare;
        } else {
            return undefined;
        }
    }

    getUserShareProportion(poolAddress: string, account: string): BigNumber | undefined {
        const {tokenStore} = this.rootStore;
        const userShare = tokenStore.getBalance(poolAddress, account);
        const totalShares = tokenStore.getTotalSupply(poolAddress);

        if (userShare && totalShares) {
            return userShare.div(totalShares);
        } else {
            return undefined;
        }
    }

    formatZeroMinAmountsOut(poolAddress: string): string[] {
        const pool = this.pools[poolAddress];
        return pool.data.tokens.map(token => "0");
    }

    calcUserLiquidity(poolAddress: string, account: string): BigNumber | undefined {
        const poolValue = this.rootStore.marketStore.getPortfolioValue(
            this.getPoolSymbols(poolAddress),
            this.getPoolBalances(poolAddress)
        );
        const userProportion = this.getUserShareProportion(poolAddress, account);
        if (userProportion) {
            return userProportion.times(poolValue);
        } else {
            return undefined;
        }
    }

    getPoolSymbols(poolAddress: string): string[] {
        return this.getPool(poolAddress).tokens.map(token => token.symbol);
    }

    getPoolBalances(poolAddress: string): BigNumber[] {
        return this.getPool(poolAddress).tokens.map(token => token.balance);
    }

    getPoolData(poolAddress: string): PoolData | undefined {
        if (this.pools[poolAddress]) {
            return this.pools[poolAddress];
        }
        return undefined;
    }

    getPublicPools(filter?: object): Pool[] {
        let pools: Pool[] = [];
        Object.keys(this.pools).forEach(key => {
            if (this.pools[key].data.finalized) {
                pools.push(this.pools[key].data);
            }
        });
        return pools;
    }

    getPool(poolAddress: string): Pool | undefined {
        if (this.pools[poolAddress]) {
            return this.pools[poolAddress].data;
        }
        return undefined;
    }

    calcPoolTokensByRatio(pool: Pool, ratio: BigNumber): BigNumber {
        const {tokenStore} = this.rootStore;
        const totalPoolTokens = tokenStore.getTotalSupply(pool.address);
        return ratio.times(totalPoolTokens).integerValue(BigNumber.ROUND_DOWN);
    }

    getPoolTokenPercentage(poolAddress: string, percentage: string) {
        const totalPoolTokens = this.rootStore.tokenStore.getTotalSupply(poolAddress);
        return bnum(fromPercentage(percentage)).times(totalPoolTokens);
    }

    getPoolTokens(poolAddress: string): string[] {
        if (!this.pools[poolAddress]) {
            throw new Error(`Pool ${poolAddress} not loaded`);
        }
        return this.pools[poolAddress].data.tokensList;
    }

    @action exitPool = async (
        web3React: Web3ReactContextInterface,
        poolAddress: string,
        poolAmountIn: string,
        minAmountsOut: string[]
    ) => {
        const { providerStore } = this.rootStore;

        await providerStore.sendTransaction(
            web3React,
            ContractTypes.BPool,
            poolAddress,
            'exitPool',
            [
                poolAmountIn,
                minAmountsOut
            ]
        );

        console.log(contract);
        // await providerStore.sendTransaction(
        //     web3React,
        //     ContractTypes.BPool,
        //     poolAddress,
        //     'joinPool',
        //     [
        //         poolAmountOut.toString(),
        //         maxAmountsIn.map(amount => amount.toString()),
        //     ]
        // );
    };

    @action joinPool = async (
        web3React: Web3ReactContextInterface,
        poolAddress: string,
        poolAmountOut: BigNumber,
        maxAmountsIn: BigNumber[]
    ) => {
        const { providerStore } = this.rootStore;
        const { account } = web3React;

        const contract = providerStore.getContract(
            web3React,
            ContractTypes.BPool,
            poolAddress,
            account
        );

        console.log(contract);
        // await providerStore.sendTransaction(
        //     web3React,
        //     ContractTypes.BPool,
        //     poolAddress,
        //     'joinPool',
        //     [
        //         poolAmountOut.toString(),
        //         maxAmountsIn.map(amount => amount.toString()),
        //     ]
        // );
    };
}