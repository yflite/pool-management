import React from 'react';
import styled from 'styled-components';
import PoolAssetChartPanel from '../components/Pool/PoolAssetChartPanel';
import AddRemovePanel from '../components/Pool/AddRemovePanel';
import InfoPanel from '../components/Pool/InfoPanel';
import BalancesTable from '../components/Pool/BalancesTable';
import AddLiquidityModal from '../components/AddLiquidity/AddLiquidityModal';
import RemoveLiquidityModal from '../components/RemoveLiquidity/RemoveLiquidityModal';
import { observer } from 'mobx-react';
import { useStores } from '../contexts/storesContext';
import {
    bnum,
    formatBalanceTruncated,
    formatFee,
    formatNormalizedTokenValue,
    isAddress,
    toChecksum,
    toWei,
} from '../utils/helpers';
import { getUserShareText } from '../components/Common/PoolOverview';
import { RouteComponentProps, withRouter } from 'react-router';

const PoolViewWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    padding: 27px 25px 0px 25px;
`;

const InfoPanelWrapper = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    width: 100%;
    justify-content: flex-start;
    div {
    }
`;

const SwapsTable = styled.div``;

const Pool = observer((props: RouteComponentProps) => {
    const poolAddress = toChecksum(props.match.params.poolAddress);
    const {
        root: {
            poolStore,
            providerStore,
            marketStore,
            appSettingsStore,
            blockchainFetchStore,
            addLiquidityFormStore,
            removeLiquidityFormStore,
            tokenStore,
        },
    } = useStores();

    if (!isAddress(poolAddress)) {
        return (
            <PoolViewWrapper>Please input a valid Pool address</PoolViewWrapper>
        );
    }

    const pool = poolStore.getPool(poolAddress);
    const web3React = providerStore.getActiveWeb3React();
    const { account } = web3React;

    if (poolStore.poolsLoaded && !pool) {
        return (
            <PoolViewWrapper>
                Pool with specified address not found
            </PoolViewWrapper>
        );
    }

    if (pool) {
        if (appSettingsStore.activePoolAddress !== poolAddress) {
            console.debug(['Set Active Pool Address']);
            appSettingsStore.setActivePoolAddress(poolAddress);
            blockchainFetchStore.onActivePoolChanged(web3React);
        }
    }

    let userPoolTokens = undefined;
    const totalPoolTokens = tokenStore.getTotalSupply(poolAddress);

    if (account) {
        userPoolTokens = tokenStore.getBalance(poolAddress, account);
    }

    if (account) {
        userPoolTokens = tokenStore.getBalance(poolAddress, account);
    }

    const feeText = pool ? formatFee(pool.swapFee) : '-';
    const shareText = getUserShareText(
        pool,
        account,
        totalPoolTokens,
        userPoolTokens
    );

    const liquidityText =
        marketStore.assetPricesLoaded && pool
            ? Number(formatNormalizedTokenValue(
                  marketStore.getPortfolioValue(pool),
                  4,
                  20
              )).toLocaleString()
            : '-';

    return (
        <PoolViewWrapper>
            {addLiquidityFormStore.modalOpen ? (
                <AddLiquidityModal poolAddress={poolAddress} />
            ) : (
                <div />
            )}
            {removeLiquidityFormStore.modalOpen ? (
                <RemoveLiquidityModal poolAddress={poolAddress} />
            ) : (
                <div />
            )}
            <PoolAssetChartPanel poolAddress={poolAddress} />
            <AddRemovePanel poolAddress={poolAddress} />
            <InfoPanelWrapper>
                <InfoPanel text={`$ ${liquidityText}`} subText="Liquidity" />
                <InfoPanel text="$ -" subText="Trade Volume (24hr)" />
                <InfoPanel text={feeText} subText="Pool Swap Fee" />
                <InfoPanel text={shareText} subText="My Pool Share" />
            </InfoPanelWrapper>
            <BalancesTable poolAddress={poolAddress} />
            <SwapsTable />
        </PoolViewWrapper>
    );
});

export default withRouter(Pool);
