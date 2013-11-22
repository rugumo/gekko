var BTCE = require('btce');

var moment = require('moment');
var util = require('../util');
var _ = require('lodash');
var log = require('../log')

var Trader = function(config) {
  this.key = config.key;
  this.secret = config.secret;
  this.asset = config.asset;
  this.pair =  config.asset.toLowerCase() + '_' + config.currency.toLowerCase();
  this.name = 'BTC-E';

  _.bindAll(this);

  this.btce = new BTCE(this.key, this.secret);
}

Trader.prototype.buy = function(amount, price, callback) {
  // Prevent "You incorrectly entered one of fields."
  // because of more than 8 decimals.
  amount *= 100000000;
  amount = Math.floor(amount);
  amount /= 100000000;

  var set = function(err, data) {
    if(err)
      log.error('unable to buy:', err);

    callback(data.order_id);
  };

  // workaround for nonce error
  setTimeout(_.bind(function() {
    this.btce.trade({'pair': this.pair, 'type':'buy', 'rate': price,'amount': amount}, _.bind(set, this));
  }, this), 1000);
}

Trader.prototype.sell = function(amount, price, callback) {
  // Prevent "You incorrectly entered one of fields."
  // because of more than 8 decimals.
  amount *= 100000000;
  amount = Math.ceil(amount);
  amount /= 100000000;

  var set = function(err, data) {
    if(err)
      log.error('unable to sell:', err);

    callback(err, data.order_id);
  };

  // workaround for nonce error
  setTimeout(_.bind(function() {
      //{'pair': 'btc_usd', 'type': 'buy', 'rate': 100.0, 'amount': 2.0}
    this.btce.trade({'pair': this.pair, 'type':'sell', 'rate': price,'amount': amount}, _.bind(set, this));
  }, this), 1000);
}

// if BTC-e errors we try the same call again after
// 5 seconds or half a second if there is haste
Trader.prototype.retry = function(method, callback, haste) {
  var wait = +moment.duration(haste ? 0.5 : 5, 'seconds');
  log.debug(this.name , 'returned an error, retrying..');
  setTimeout(
    _.bind(method, this),
    wait,
    _.bind(callback, this)
  );
}

Trader.prototype.getPortfolio = function(callback) {
  var calculate = function(err, data) {
    if(err)
      return this.retry(this.btce.getInfo, calculate);

    var portfolio = [];
      var funds = data.return.funds;

      for (var key in funds){
          portfolio.push({name: key.toUpperCase(), amount: funds[key]});
      }

      /*
    _.each(data.return.funds.xpm, function(data) {

        console.log(data);
        console.log('1');

      portfolio.push({name: config.asset, amount: data});
    });
      */
    callback(err, portfolio);
  }
  this.btce.getInfo(_.bind(calculate, this));
}

Trader.prototype.getTicker = function(callback) {
  // BTCE-e doesn't state asks and bids in its
  // ticker
  var set = function(err, data) {
    var ticker = _.extend(data.ticker, {
      ask: data.ticker.buy,
      avg: data.ticker.avg,
      last: data.ticker.last,
      bid: data.ticker.sell
    });
    callback(err, ticker);
  }
  this.btce.ticker({ pair: this.pair}, _.bind(set, this));
}

Trader.prototype.getTrades = function(since, callback, descending) {
//console.log(since);
    if(since && !_.isNumber(since))
        since = util.toMicro(since);
    var args = {'pair':this.pair,'count':5000};
    this.btce.trades(args, _.bind(function(err,trades) {
        if (!trades)
            return this.retry(this.getTrades, args);

        if (trades.length === 0)
            return this.retry(this.getTrades, args);

        var trades2 = trades.sort(function(a,b){
            a = new Date(a.date);
            b = new Date(b.date);
            return a<b?-1:a>b?1:0;
        });
        // normalize the data
        var trades3 = [];
        _.each(trades2, function(array) {
            var test = moment.unix(array.date);
            var tradeSince = util.toMicro(test);

            if(since){
//              log.debug('since time');
                if(since <=tradeSince){
//log.debug(since +' = ' + tradeSince);
                    trades3.push({
                        date: array.date,
                        price: array.price,
                        amount: array.amount
                    });
                }else{
//log.debug('Not A New Trade');
                }
            }else{
                //    log.debug('No since time');
                trades3.push({
                    date: array.date,
                    price: array.price,
                    amount: array.amount
                });

            }
        });

//console.log(trades2);

        if(descending)
            callback(trades3.reverse());
        else
            callback(trades3);
    }, this));
}





Trader.prototype.getFee = function(callback) {
  // BTCE-e doesn't have different fees based on orders
  // at this moment it is always 0.2%
  callback(false, 0.002);
}

Trader.prototype.checkOrder = function(order, callback) {
  var check = function(err, result) {

    // btce returns an error when you have no open trades
    // right now we assume on every error that the order
    // was filled.
    //
    // TODO: check whether the error stats that there are no
    // open trades or that there is something else.
      /*
       { success: 1,
       return:
       { '66308825':
       { pair: 'xpm_btc',
       type: 'sell',
       amount: 82.18681026,
       rate: 0.00145,
       timestamp_created: 1385082642,
       status: 0 } } }

       */

    if(err){
        console.log("ERR");
      callback(false, true);
    }else{
        console.log(result);
      callback(err, !result.return);
    }
  };

  this.btce.orderList({pair:this.pair}, _.bind(check, this));
}

Trader.prototype.cancelOrder = function(order) {
  // TODO: properly test
  var devNull = function() {}
  this.btce.orderList(order, devNull);
}

module.exports = Trader;